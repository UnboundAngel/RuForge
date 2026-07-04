# ruforge.local experiment (research note)

Status: dev-gated experiment in tree. Not public V1. Not LAN.

## Goal

Friendly same-PC URL (`http://ruforge.local:<port>`) without changing Companion
V1 localhost bind or enabling LAN access.

## Mechanisms considered

| Mechanism | Same-PC | LAN | New dependency | Traffic leaves machine |
|-----------|---------|-----|----------------|------------------------|
| Hosts file `127.0.0.1 ruforge.local` | Yes | No | No | No (loopback only) |
| mDNS responder (RFC 6762) | Partial | Yes | Yes (`mdns-sd` etc.) | Yes (UDP 5353 multicast) |
| OS service / DNS registration | No | Varies | High | Varies |

## Decision

**Same-PC experiment:** manual hosts file + OS resolver probe. Implemented in
`src-tauri/src/companion/local_name.rs` and dev-gated command
`companion_local_name_experiment`.

**Future LAN (V2 only):** mDNS/DNS-SD after written threat model. Windows 10
1703+ includes native mDNS in the DNS Client service (Microsoft Tech Community,
RFC 6762). Enterprise networks that serve unicast `.local` zones break mDNS
resolution; probe fail-closed on non-loopback answers covers the same-PC case.

## What the experiment does

- Probes whether `ruforge.local` resolves via `tokio::net::lookup_host`.
- Offers a friendly open URL only when every resolved IP is loopback and the
  companion server is running on `127.0.0.1`.
- Shows hosts line `127.0.0.1 ruforge.local` for manual admin edit.
- Does not edit hosts, register mDNS, bind `0.0.0.0`, or change default
  `http://localhost:<port>` open behavior.

## Origin note

`localhost` and `ruforge.local` are different browser origins. Session cookies
from one do not apply to the other. Users must pick one hostname per session;
default remains localhost.

## Primary sources

- RFC 6762 (Multicast DNS), Section 3: `.local` is link-local special-use.
- RFC 6763 (DNS-Based Service Discovery).
- Microsoft Tech Community: native mDNS in Windows 10 1703+.

## Out of scope (this pass)

- Automatic hosts file modification (requires elevation, support burden).
- mDNS `_ruforge._tcp` advertisement.
- LAN bind or QR URLs with LAN IP.
- Phone, TV, or cross-device discovery.
