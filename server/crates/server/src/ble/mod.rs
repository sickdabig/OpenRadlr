//! Server-side Bluetooth devices.
//!
//! The server owns the Bluetooth link (for a home server with the bike next
//! to it) and relays readings to the riding client over the game WebSocket;
//! see the design spec and [ADR 0020](../../docs/adr/0020-server-side-ble.md).
//! [`yesoul`] is the pure protocol; [`bike`] is the Bluetooth side and is
//! only built with the `bike` cargo feature (Linux needs BlueZ and libdbus).
//! The claim registry lives here so the server builds with or without the
//! feature: a configured bike on a build without it logs a startup warning
//! and stays unconnected, answering `use_bike` with `bike_unavailable`.

pub mod yesoul;

use openradlr_sim::RiderId;
use std::sync::Arc;
use std::sync::Mutex;
use tokio::sync::watch;

use self::yesoul::Reading;

#[cfg(feature = "bike")]
pub mod bike;

/// What the bike last reported; all zeros while it is quiet or gone.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Status {
    /// False between connections (restart, bike off, out of range).
    pub connected: bool,
    pub power_w: f64,
    pub cadence_rpm: f64,
    /// Raw resistance knob position (up to ~100 on an S3).
    pub resistance: u8,
    pub distance_m: f64,
}

impl Status {
    /// Builds a status from a parsed bike packet: riding, values as sent.
    pub fn from_reading(reading: Reading) -> Self {
        Self {
            connected: true,
            power_w: reading.power_w,
            cadence_rpm: reading.cadence_rpm,
            resistance: reading.resistance,
            distance_m: reading.distance_m,
        }
    }

    pub fn disconnected() -> Self {
        Self {
            connected: false,
            power_w: 0.0,
            cadence_rpm: 0.0,
            resistance: 0,
            distance_m: 0.0,
        }
    }
}

/// The server's own bike: one Bluetooth link, ridden by at most one client
/// at a time. The manager task (feature `bike`) owns the link and publishes
/// statuses; `claim` decides whose connection the readings go to.
pub struct BikeHub {
    kind: &'static str,
    sender: watch::Sender<Status>,
    /// Keeps the latest status alive: a `watch::Sender` with no receiver
    /// drops what it is sent.
    _receiver: watch::Receiver<Status>,
    /// True while a rider holds a claim: the Bluetooth link may then connect.
    /// The adapter (feature `bike`) waits for this before it scans, and hangs
    /// up when it falls back to false, so the bike stays free for other apps
    /// until this app asks for it.
    demand: watch::Sender<bool>,
    _demand_receiver: watch::Receiver<bool>,
    /// The rider currently riding the bike, with a ticket number so a
    /// replaced claim of the same rider cannot release the newer one.
    claimed: Mutex<Option<(RiderId, u64)>>,
    claims: std::sync::atomic::AtomicU64,
}

/// The right to ride the bike, held for as long as the claiming connection
/// lives. Dropping it frees the bike for the next rider.
pub struct BikeClaim {
    hub: Arc<BikeHub>,
    rider_id: RiderId,
    ticket: u64,
    /// Reading updates as they come off the bike; starts at the status now.
    pub status: watch::Receiver<Status>,
}

/// Why a claim was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClaimError {
    /// Another rider is riding the bike right now.
    Busy,
}

impl BikeHub {
    /// A hub without a running Bluetooth task (tests, and servers built
    /// without the `bike` feature that still report a configured bike).
    pub fn new(kind: &'static str) -> Self {
        let (sender, receiver) = watch::channel(Status::disconnected());
        let (demand, demand_receiver) = watch::channel(false);
        Self {
            kind,
            sender,
            _receiver: receiver,
            demand,
            _demand_receiver: demand_receiver,
            claimed: Mutex::new(None),
            claims: std::sync::atomic::AtomicU64::new(1),
        }
    }

    /// True while at least one rider holds a claim: the link may connect.
    pub fn demanded(&self) -> bool {
        *self.demand.borrow()
    }

    /// Resolves once the bike is demanded (returns at once when it already is).
    pub async fn wait_demanded(&self) {
        let mut demand = self.demand.subscribe();
        while !*demand.borrow_and_update() {
            if demand.changed().await.is_err() {
                return;
            }
        }
    }

    /// A stream of the demand flag, for the adapter to watch while connected.
    pub fn subscribe_demand(&self) -> watch::Receiver<bool> {
        self.demand.subscribe()
    }

    /// The bike kind as clients see it in `/api/info`.
    pub fn kind(&self) -> &'static str {
        self.kind
    }

    /// The last known status, for `/api/info`.
    pub fn snapshot(&self) -> Status {
        *self.sender.borrow()
    }

    /// Publishes a new status from the Bluetooth side.
    pub fn publish(&self, status: Status) {
        let _ = self.sender.send(status);
    }

    /// Lets `rider_id` ride the bike, if nobody else does. A successful
    /// claim also demands the bike: the Bluetooth link connects while the
    /// claim lives and hangs up when the claim ends, so the bike stays free
    /// for other apps the rest of the time.
    pub fn claim(self: &Arc<Self>, rider_id: RiderId) -> Result<BikeClaim, ClaimError> {
        let ticket = self.claims.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let mut claimed = self.claimed.lock().expect("claim registry not poisoned");
        match *claimed {
            Some((rider, _)) if rider != rider_id => return Err(ClaimError::Busy),
            _ => *claimed = Some((rider_id, ticket)),
        }
        drop(claimed);
        let sent = self.demand.send(true);
        eprintln!(
            "DBG claim: send(true) -> {:?}",
            sent.as_ref().map(|_| ()).err().map(|_| "Err").unwrap_or("Ok")
        );
        eprintln!("DBG claim: demanded after send = {}", self.demanded());
        let _ = sent;
        Ok(BikeClaim {
            hub: self.clone(),
            rider_id,
            ticket,
            status: self.sender.subscribe(),
        })
    }

    fn release(&self, rider_id: RiderId, ticket: u64) {
        let mut claimed = self.claimed.lock().expect("claim registry not poisoned");
        if *claimed == Some((rider_id, ticket)) {
            *claimed = None;
            let _ = self.demand.send(false);
        }
    }
}

impl Drop for BikeClaim {
    fn drop(&mut self) {
        self.hub.release(self.rider_id, self.ticket);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hub() -> Arc<BikeHub> {
        Arc::new(BikeHub::new("test"))
    }

    #[test]
    fn the_first_rider_claims_and_a_second_is_refused() {
        let hub = hub();
        let first = hub.claim(1).expect("a free bike is claimable");
        assert!(matches!(hub.claim(2), Err(ClaimError::Busy)));
        drop(first);
        assert!(hub.claim(2).is_ok(), "a released bike is claimable again");
    }

    #[test]
    fn the_bike_is_demanded_only_while_a_claim_holds() {
        let hub = hub();
        assert!(!hub.demanded(), "an unclaimed bike is not demanded");
        let claim = hub.claim(1).expect("claim");
        assert!(hub.demanded(), "a claim demands the bike");
        drop(claim);
        assert!(!hub.demanded(), "the claim's end frees the bike");
    }

    #[test]
    fn the_same_rider_can_reclaim_after_a_reconnect() {
        let hub = hub();
        let first = hub.claim(7).expect("first claim");
        assert!(hub.demanded());
        drop(first);
        assert!(!hub.demanded());
        let second = hub.claim(7).expect("the same rider claims again");
        assert!(hub.demanded(), "the rider back from a reconnect demands again");
        drop(second);
        assert!(!hub.demanded(), "the second claim's end frees the bike too");
    }

    #[test]
    fn a_replaced_claim_releases_only_itself() {
        let hub = hub();
        let first = hub.claim(7).expect("first claim");
        let second = hub.claim(7).expect("the same rider claims again");
        drop(first); // stale: must not free the bike the newer claim holds
        assert!(matches!(hub.claim(8), Err(ClaimError::Busy)));
        drop(second);
        assert!(hub.claim(8).is_ok());
    }

    #[test]
    fn the_claim_starts_at_the_current_status_and_sees_updates() {
        let hub = hub();
        hub.publish(Status {
            connected: true,
            power_w: 150.0,
            cadence_rpm: 90.0,
            resistance: 23,
            distance_m: 1250.0,
        });
        let mut claim = hub.claim(1).expect("claim");
        assert_eq!(claim.status.borrow().power_w, 150.0);
        hub.publish(Status::disconnected());
        assert_eq!(*claim.status.borrow_and_update(), Status::disconnected());
        assert!(!hub.snapshot().connected);
    }

    #[test]
    fn a_fresh_hub_reports_a_disconnected_bike() {
        let hub = hub();
        assert_eq!(hub.snapshot(), Status::disconnected());
    }
}
