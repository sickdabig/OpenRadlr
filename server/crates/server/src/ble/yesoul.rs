//! The Yesoul S3's proprietary BLE protocol (see `docs/yesoul-s3-protocol.md`).
//!
//! Pure and always compiled: the packet parser and the link state machine
//! that turns the bike's ~1 Hz notifications (or its silence) into readings.
//! The Bluetooth side lives behind the `bike` feature (`ble::manager`).
//!
//! All times are injected seconds, like the rest of the server.

/// One decoded notification from the bike.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Reading {
    /// Watts, big-endian in the packet.
    pub power_w: f64,
    /// Revolutions per minute, direct.
    pub cadence_rpm: f64,
    /// Raw resistance level (the S3's knob is not scaled by the bike).
    pub resistance: u8,
    /// Metres, from the bike's cumulative odometer-style counter (raw/100 km).
    pub distance_m: f64,
}

impl Reading {
    /// The bike went quiet or is idle: everything at zero.
    pub fn zeroed() -> Self {
        Self {
            power_w: 0.0,
            cadence_rpm: 0.0,
            resistance: 0,
            distance_m: 0.0,
        }
    }
}

/// A notification value from 0xFFF4. Always exactly 12 bytes, all fields
/// big-endian; anything else is not a Yesoul S3 packet.
///
/// ```text
/// 0..1 unknown · 2..3 distance (u16 BE, /100 km) · 4 resistance · 5 unknown
/// 6 cadence · 7..8 power (u16 BE) · 9..11 unknown
/// ```
pub fn parse_packet(data: &[u8]) -> Option<Reading> {
    if data.len() != 12 {
        return None;
    }
    let distance_m = f64::from(u16::from_be_bytes([data[2], data[3]])) * 10.0;
    let power_w = f64::from(u16::from_be_bytes([data[7], data[8]]));
    Some(Reading {
        power_w,
        cadence_rpm: f64::from(data[6]),
        resistance: data[4],
        distance_m,
    })
}

/// A pedalling gap reads as zero after [`ZERO_AFTER_S`], as a lost bike after
/// [`STALE_S`]; a bike that never sends anything within [`FIRST_PACKET_S`] of
/// connecting is lost too (the protocol doc's 2 s / 15 s / 30 s constants).
pub const ZERO_AFTER_S: f64 = 2.0;
pub const STALE_S: f64 = 15.0;
pub const FIRST_PACKET_S: f64 = 30.0;

/// What [`Link::poll`] wants the Bluetooth side to do.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LinkEvent {
    /// Publish this (possibly zeroed) reading.
    Publish(Reading),
    /// The bike is gone: drop the GATT connection and reconnect.
    Stale,
}

/// The state of one GATT connection to the bike, fed with packets and ticks.
#[derive(Debug)]
pub struct Link {
    connected_at_s: f64,
    last_packet_s: Option<f64>,
    /// A zero reading was published since the last packet: publish it once.
    zeroed: bool,
}

impl Link {
    /// Starts the clock for a freshly connected (and handshaked) bike.
    pub fn new(now_s: f64) -> Self {
        Self {
            connected_at_s: now_s,
            last_packet_s: None,
            zeroed: false,
        }
    }

    /// A packet arrived: publish it and restart the silence clock.
    pub fn on_packet(&mut self, reading: Reading, now_s: f64) -> LinkEvent {
        self.last_packet_s = Some(now_s);
        self.zeroed = false;
        LinkEvent::Publish(reading)
    }

    /// Called on a steady tick (about twice a second) while connected.
    pub fn poll(&mut self, now_s: f64) -> Option<LinkEvent> {
        // Before the first packet only the longer "connected but silent" rule
        // applies; afterwards silence means a lost bike sooner.
        let silence = match self.last_packet_s {
            Some(last) => now_s - last,
            None => now_s - self.connected_at_s,
        };
        let stale_after = if self.last_packet_s.is_some() {
            STALE_S
        } else {
            FIRST_PACKET_S
        };
        if silence >= stale_after {
            return Some(LinkEvent::Stale);
        }
        if silence >= ZERO_AFTER_S && !self.zeroed {
            self.zeroed = true;
            return Some(LinkEvent::Publish(Reading::zeroed()));
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `f5…`- shaped packet the bridge sees on a real S3 at ~90 rpm, 150 W,
    /// resistance 23, 1.25 km on the odometer (raw 125).
    fn packet() -> Vec<u8> {
        vec![0x01, 0x02, 0x00, 0x7d, 23, 0x00, 90, 0x00, 0x96, 0, 0, 0]
    }

    #[test]
    fn a_12_byte_packet_decodes_big_endian() {
        let reading = parse_packet(&packet()).expect("a real-shaped packet decodes");
        assert_eq!(reading.power_w, 150.0);
        assert_eq!(reading.cadence_rpm, 90.0);
        assert_eq!(reading.resistance, 23);
        assert_eq!(reading.distance_m, 1250.0);
    }

    #[test]
    fn a_power_above_255_decodes_from_both_bytes() {
        let mut data = packet();
        data[7] = 0x01;
        data[8] = 0x2c;
        assert_eq!(parse_packet(&data).unwrap().power_w, 300.0);
    }

    #[test]
    fn other_lengths_are_rejected() {
        for len in [0, 11, 13, 16] {
            let data = vec![0u8; len];
            assert!(parse_packet(&data).is_none(), "length {len} is not a packet");
        }
    }

    #[test]
    fn a_fresh_packet_publishes_its_reading() {
        let mut link = Link::new(100.0);
        let reading = parse_packet(&packet()).unwrap();
        assert_eq!(link.on_packet(reading, 100.4), LinkEvent::Publish(reading));
    }

    #[test]
    fn a_gap_over_two_seconds_reads_as_zero_once() {
        let mut link = Link::new(100.0);
        let reading = parse_packet(&packet()).unwrap();
        link.on_packet(reading, 100.4);
        assert_eq!(link.poll(101.0), None, "still fresh");
        assert_eq!(link.poll(102.3), None, "just under the gap");
        assert_eq!(link.poll(102.5), Some(LinkEvent::Publish(Reading::zeroed())));
        assert_eq!(link.poll(102.9), None, "zero is published once");
        assert_eq!(
            link.on_packet(reading, 103.5),
            LinkEvent::Publish(reading),
            "the next packet is fresh again"
        );
        assert_eq!(link.poll(104.0), None);
    }

    #[test]
    fn a_gap_over_fifteen_seconds_loses_the_bike() {
        let mut link = Link::new(100.0);
        let reading = parse_packet(&packet()).unwrap();
        link.on_packet(reading, 100.4);
        assert_eq!(
            link.poll(115.0),
            Some(LinkEvent::Publish(Reading::zeroed())),
            "quiet rides read zero"
        );
        assert_eq!(link.poll(115.5), Some(LinkEvent::Stale));
    }

    #[test]
    fn no_first_packet_within_thirty_seconds_loses_the_bike() {
        let mut link = Link::new(100.0);
        assert_eq!(
            link.poll(102.5),
            Some(LinkEvent::Publish(Reading::zeroed())),
            "waiting rides at zero"
        );
        assert_eq!(link.poll(120.0), None);
        assert_eq!(link.poll(130.0), Some(LinkEvent::Stale));
    }

    #[test]
    fn a_zerod_bike_that_sends_again_publishes_fresh_values() {
        let mut link = Link::new(0.0);
        let reading = parse_packet(&packet()).unwrap();
        link.on_packet(Reading::zeroed(), 5.0);
        assert_eq!(
            link.poll(10.0),
            Some(LinkEvent::Publish(Reading::zeroed())),
            "silence keeps riding at zero"
        );
        assert_eq!(link.on_packet(reading, 20.0), LinkEvent::Publish(reading));
    }
}
