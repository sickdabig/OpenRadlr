# Yesoul S3 BLE Protocol Spec

Data model of the Yesoul S3 spin bike's proprietary BLE protocol, so other
apps can decode it directly without going through the bridge
(`src/main.cpp` with `S3_LAYOUT 2`, which is this exact mapping, tested
against a real S3). Cross-checked against QZ (`qdomyos-zwift`,
`src/devices/yesoulbike.cpp`) in November 2025.

## Overview

The S3 exposes one proprietary service. There is no FTMS on the bike itself;
the bridge *produces* FTMS for the apps.

| UUID    | Type          | Comment                                        |
|---------|---------------|------------------------------------------------|
| `0xFFF0`| Service       | Proprietary Yesoul service                     |
| `0xFFF1`| Write         | Init handshake target                          |
| `0xFFF4`| Notify (16 B) | Telemetry stream, the only data source         |

## Connection sequence

Order matters -- the bike is silent until handshaked:

1. Scan: match `yesoul` (case-insensitive) in the advertised name. The S3
   advertises name `YESOUL` (variants like `YS_G1M_*` exist for other models).
2. Connect (auto-connect: the bike stops advertising when powered off).
3. Service discovery; take 0xFFF1 (write) and 0xFFF4 (notify).
4. **Subscribe to 0xFFF4** (write `01 00` to its Client Characteristic
   Configuration descriptor).
5. **Then** write the init packet to 0xFFF1 **without response**:
   `f5 20 20 40 f6` (always the same 5 bytes).
6. Telemetry flows ~1 Hz once the init packet was accepted.

Probed against the real bike (2026-11, BlueZ/btleplug): every write **with**
response to 0xFFF1 is rejected with the vendor ATT error `0x20` (not a
standard ATT code) and the bike stays silent; the same packet **without**
response is accepted immediately. An earlier revision of this doc claimed the
opposite (init with response, then subscribe, following a QZ note); that does
not match this bike. **Pairing is not part of the sequence**: the bike ignores
SMP pairing attempts outright (connect stays `Paired: no`) and works fine
unbonded, so no pairing button on the bike is needed.

## Notification packet (0xFFF4)

Always exactly 12 bytes -- reject other lengths. All multi-byte fields are
big-endian. No checksum/framing beyond the raw notification value.

| Offset | Size | Field          | Encoding                          | Unit / scale              |
|--------|------|----------------|-----------------------------------|---------------------------|
| 0..1   | 2    | unknown header | apparently stable during a session | ignore                    |
| 2..3   | 2    | distance       | uint16 BE, raw / 100              | km (odometer-style)       |
| 4      | 1    | resistance     | uint8 raw                         | level (see below)         |
| 5      | 1    | unknown        | typically 0                       | ignore                    |
| 6      | 1    | cadence        | uint8 raw                         | rpm                       |
| 7..8   | 2    | power          | uint16 BE                         | W                         |
| 9..11  | 3    | unknown        | typically 0                       | ignore                    |

## Derived values (as the bridge publishes them)

| Value    | Formula                                   | Note                                            |
|----------|-------------------------------------------|-------------------------------------------------|
| cadence  | `data[6]`                                 | rpm, direct                                     |
| power    | `(data[7] << 8) \| data[8]`, × POWER_SCALE | `POWER_SCALE = 1.0` (calibration hook)          |
| speed    | `cadence × 0.375`                         | `SPEED_PER_RPM = 0.375` km/h per rpm, QZ approx  |
| distance | `(data[2] << 8 \| data[3]) / 100`         | cumulative-style counter; QZ treats unit as km, but computes its own distance from speed -- treat raw field as unreliable |

Resistance is a raw uint8 byte. It is not scaled by the bike. The S3's knob
has 1..N physical levels; empirically values up to ~100 appear. For a
Peloton-style 0-100 display QZ maps: `res × 0.88 + offset` (default), or
`res × 1.1099 − 20.769` (Peloton formula setting, `yesoul_peloton_formula`).

## Behavior notes for consumers

- Data arrives while pedaling (~1 Hz). At zero cadence the bike keeps
  sending or goes quiet; treat a gap of > 2 s as zero AND > 15 s as
  disconnect (the bridge's constants: `ZERO_AFTER_MS`, `STALE_MS`).
- At connect, values may stay silent until the handshake is acked;
  force-reconnect if connected but no packet within 30 s
  (`S3_NO_DATA_RECONNECT_MS`).
- Cadence/power/resistance jump to 0 when the bike is idle — do not
  low-pass-filter the watts, they are already stable per packet.

## Alternative layouts (kept for completeness)

The parser also documents other Yesoul byte assignments that did **not**
match this S3 -- only useful with other Yesoul models:

| Layout | Source            | Cadence         | Resistance | Power              | Min len |
|--------|-------------------|-----------------|-----------|--------------------|---------|
| 1      | darksid3r Yesoul_BLE | data[4..5], LE, 0.5 rpm | data[9]   | data[11..12], LE | 13      |
| 3      | empirical raw dump   | data[6]      | data[8]   | data[10..11], LE   | 12      |

## Provenance / confidence

- Connection sequence, packet length, field offsets 4/6/7-8 and big-endian
  watts: verified against QZ source (2025-11) and a working bridge on this S3;
  the handshake order and write type were re-verified directly against the
  bike (2026-11) after the bridge's claimed order failed in the field.
- Distance unit (km) and resistance range: reported by QZ, not
  independently verified against the bike.
- The unknown header bytes (0..1, 5, 9..11): observed stable/zero, no
  public documentation -- dump and re-check if they ever move.
