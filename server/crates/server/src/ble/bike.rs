//! The Bluetooth side of the server's bike (feature `bike`), over
//! [`btleplug`]: scan for the bike, connect, run the Yesoul handshake and
//! stream parsed readings into the [`BikeHub`](super::BikeHub). All decisions
//! (timeouts, zeroing) live in the pure [`yesoul`](super::yesoul) module; this
//! file is the adapter, tested against real hardware only.

use super::yesoul::{self, Link, Reading};
use super::{BikeHub, Status};
use crate::config::BikeKind;
use std::sync::Arc;
use std::time::Duration;

/// Pause between reconnect attempts; the bike stops advertising when off, so
/// scanning finds nothing until it is back.
const RECONNECT_PAUSE: Duration = Duration::from_secs(3);
/// How often the scan results are refreshed while looking for the bike.
const SCAN_PAUSE: Duration = Duration::from_millis(500);
/// Ticks while connected: twice a second is enough for the 2 s / 15 s rules.
const POLL_INTERVAL: Duration = Duration::from_millis(500);
/// One GATT step (connect, discover, handshake write, subscribe).
const STEP_TIMEOUT: Duration = Duration::from_secs(15);

const SERVICE_UUID: uuid::Uuid = uuid::uuid!("0000fff0-0000-1000-8000-00805f9b34fb");
const INIT_UUID: uuid::Uuid = uuid::uuid!("0000fff1-0000-1000-8000-00805f9b34fb");
const NOTIFY_UUID: uuid::Uuid = uuid::uuid!("0000fff4-0000-1000-8000-00805f9b34fb");
/// The bike stays silent until it has seen these five bytes on 0xFFF1 (written
/// with response), and the subscription must come afterwards (protocol doc).
const INIT_PACKET: [u8; 5] = [0xf5, 0x20, 0x20, 0x40, 0xf6];

type BoxError = Box<dyn std::error::Error + Send + Sync>;

impl BikeHub {
    /// Starts the Bluetooth manager task. Must run inside a Tokio runtime.
    pub fn start(kind: BikeKind) -> Arc<Self> {
        let hub = Arc::new(Self::new(kind.kind()));
        let worker = hub.clone();
        tokio::spawn(async move {
            loop {
                if let Err(error) = run(&worker).await {
                    tracing::warn!("bike link: {error}");
                }
                worker.publish(Status::disconnected());
                tokio::time::sleep(RECONNECT_PAUSE).await;
            }
        });
        hub
    }
}

/// Runs the link forever: scan, connect, stream, and back to scanning when
/// the bike disappears. Returns only on a fatal setup error.
async fn run(hub: &BikeHub) -> Result<(), BoxError> {
    use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter};

    let manager = btleplug::platform::Manager::new().await?;
    let mut announced = false;
    loop {
        for adapter in manager.adapters().await? {
            if let Err(error) = adapter.start_scan(ScanFilter::default()).await {
                // The scan by design spans several loop cycles: BlueZ keeps its
                // discovery running, so every later start answers "already in
                // progress". Treating it as a failure killed each cycle before
                // the bike was even looked for.
                if !scan_in_progress(&error) {
                    return Err(error.into());
                }
                tracing::debug!("the scan is already running, kept");
            }
        }
        tokio::time::sleep(SCAN_PAUSE).await;
        for adapter in manager.adapters().await? {
            for peripheral in adapter.peripherals().await? {
                let name = peripheral
                    .properties()
                    .await
                    .ok()
                    .flatten()
                    .and_then(|properties| properties.local_name)
                    .unwrap_or_default();
                if !name.to_lowercase().contains("yesoul") {
                    continue;
                }
                if !announced {
                    tracing::info!(name, "bike found, connecting");
                    announced = true;
                }
                match session(hub, &peripheral).await {
                    Ok(()) => tracing::info!("bike link closed, scanning again"),
                    Err(error) => {
                        tracing::warn!("bike link: {error}");
                        // The pause is part of the reconnect contract, not only
                        // of fatal setup errors: a failing handshake retried at
                        // scan speed just hammers the bike's firmware.
                        tokio::time::sleep(RECONNECT_PAUSE).await;
                    }
                }
            }
        }
    }
}

/// True when the platform rejected a scan start because it is already scanning.
/// BlueZ answers `org.bluez.Error.InProgress` ("Operation already in progress");
/// the ongoing scan is exactly the one we asked for, so the retry keeps it.
fn scan_in_progress(error: &btleplug::Error) -> bool {
    error.to_string().to_lowercase().contains("already in progress")
}

/// Names a GATT step in its error, so a failing handshake says where it died.
async fn named_step<T>(
    what: &'static str,
    op: impl std::future::Future<Output = btleplug::Result<T>>,
) -> Result<T, BoxError> {
    tokio::time::timeout(STEP_TIMEOUT, op)
        .await
        .map_err(|_| -> BoxError { format!("{what}: no answer within {} s", STEP_TIMEOUT.as_secs()).into() })?
        .map_err(|error| format!("{what}: {error}").into())
}

/// One connect–handshake–stream cycle; returns when the bike is lost.
async fn session(hub: &BikeHub, peripheral: &btleplug::platform::Peripheral) -> Result<(), BoxError> {
    use btleplug::api::{Characteristic, Peripheral as _, WriteType};
    use futures_util::StreamExt;

    if !peripheral.is_connected().await.map_err(|e| -> BoxError { e.into() })? {
        named_step("connecting GATT", peripheral.connect()).await?;
    }
    named_step("discovering services", peripheral.discover_services()).await?;
    if !peripheral.services().iter().any(|service| service.uuid == SERVICE_UUID) {
        return Err("the device does not expose the Yesoul service (0xFFF0)".into());
    }
    let find = |uuid: &uuid::Uuid| -> Option<Characteristic> {
        peripheral.characteristics().iter().find(|c| c.uuid == *uuid).cloned()
    };
    let init = find(&INIT_UUID).ok_or("no init characteristic (0xFFF1)")?;
    let notify = find(&NOTIFY_UUID).ok_or("no notify characteristic (0xFFF4)")?;
    // Order matters — and on this firmware it is the reverse of the old doc's
    // "init with write response, only then subscribe": the S3 answers a write
    // WITH response with the vendor error 0x20 and stays silent, but accepts
    // the init write WITHOUT response; telemetry flows once subscribed, so
    // subscribe first, then write (probed against the real bike, 2026-11).
    named_step("subscribing to 0xFFF4", peripheral.subscribe(&notify)).await?;
    named_step(
        "writing the init packet (0xFFF1, without response)",
        peripheral.write(&init, &INIT_PACKET, WriteType::WithoutResponse),
    )
    .await?;

    let mut link = Link::new(now_s());
    hub.publish(Status::from_reading(Reading::zeroed()));
    let mut notifications = Box::pin(peripheral.notifications().await?);
    let mut tick = tokio::time::interval(POLL_INTERVAL);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    tracing::info!("bike handshaked, streaming readings");
    loop {
        tokio::select! {
            notification = notifications.next() => {
                let Some(notification) = notification else {
                    return Err("notification stream ended".into());
                };
                let Some(reading) = yesoul::parse_packet(&notification.value) else {
                    tracing::debug!(len = notification.value.len(), "dropped a packet of the wrong shape");
                    continue;
                };
                if let yesoul::LinkEvent::Publish(reading) = link.on_packet(reading, now_s()) {
                    hub.publish(Status::from_reading(reading));
                }
            }
            _ = tick.tick() => match link.poll(now_s()) {
                Some(yesoul::LinkEvent::Publish(reading)) => hub.publish(Status::from_reading(reading)),
                Some(yesoul::LinkEvent::Stale) => return Err("no data from the bike for too long".into()),
                None => {}
            },
        }
    }
}

fn now_s() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_scan_that_is_already_running_is_not_a_failure() {
        // BlueZ's org.bluez.Error.InProgress text as it arrives through btleplug.
        let error = btleplug::Error::Other("org.bluez.Error.InProgress: Operation already in progress".into());
        assert!(scan_in_progress(&error));
        assert!(!scan_in_progress(&btleplug::Error::PermissionDenied));
        assert!(!scan_in_progress(&btleplug::Error::DeviceNotFound));
    }
}
