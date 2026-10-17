use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;

pub const SESSION_COOKIE: &str = "rf_companion";

type HmacSha256 = Hmac<Sha256>;

pub fn random_token(num_bytes: usize) -> String {
    let mut buf = vec![0u8; num_bytes];
    OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// Paired phones stay paired across app restarts; revoking is how access ends.
/// Server-side cap matching the cookie's `Max-Age`, so a copied token still stops working on its own.
pub const SESSION_MAX_AGE_SECS: i64 = 180 * 86_400;
pub const SESSION_IDLE_SECS: i64 = 90 * 86_400;

/// Only this hash reaches disk, so a leaked devices file cannot be replayed as a cookie.
pub fn hash_token(token: &str) -> String {
    use sha2::Digest;
    hex_encode(&Sha256::digest(token.as_bytes()))
}

pub fn secret_to_hex(secret: &[u8; 32]) -> String {
    hex_encode(secret)
}

pub fn secret_from_hex(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(hex.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}

pub fn session_expired(created_at: i64, last_seen: i64, now: i64) -> bool {
    now - created_at > SESSION_MAX_AGE_SECS || now - last_seen > SESSION_IDLE_SECS
}

/// DNS rebinding sends the attacker's hostname in `Host`; only loopback names on our port pass,
/// plus this machine's own Tailscale name when `tailscale serve` proxies HTTPS onto loopback.
pub fn host_allowed(host: &str, port: u16, tailnet_host: Option<&str>) -> bool {
    let host = host.trim().to_ascii_lowercase();
    if ["localhost", "127.0.0.1", "[::1]"]
        .iter()
        .any(|name| host == format!("{name}:{port}"))
    {
        return true;
    }
    match tailnet_host {
        Some(ts) if is_tailnet_name(ts) => host == ts || host == format!("{ts}:443"),
        _ => false,
    }
}

pub fn is_tailnet_name(name: &str) -> bool {
    name.ends_with(".ts.net")
        && name.len() > ".ts.net".len()
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
}

/// No 0/O, 1/I/L, or U so a code read off the PC screen types cleanly on a phone.
const PAIRING_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTVWXYZ23456789";
pub const PAIRING_CODE_LEN: usize = 8;

pub fn random_pairing_code() -> String {
    let mut out = String::with_capacity(PAIRING_CODE_LEN);
    let limit = 256 - (256 % PAIRING_ALPHABET.len());
    let mut buf = [0u8; 1];
    while out.len() < PAIRING_CODE_LEN {
        OsRng.fill_bytes(&mut buf);
        let b = buf[0] as usize;
        if b < limit {
            out.push(PAIRING_ALPHABET[b % PAIRING_ALPHABET.len()] as char);
        }
    }
    out
}

pub fn normalize_pairing_code(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn sign_media(secret: &[u8; 32], kind: &str, id: &str, sid: &str, exp: i64) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("hmac accepts any key length");
    mac.update(format!("{kind}|{id}|{sid}|{exp}").as_bytes());
    hex_encode(&mac.finalize().into_bytes())
}

pub fn verify_media_sig(
    secret: &[u8; 32],
    kind: &str,
    id: &str,
    sid: &str,
    exp: i64,
    sig_hex: &str,
) -> bool {
    let expected = sign_media(secret, kind, id, sid, exp);
    constant_time_eq(expected.as_bytes(), sig_hex.as_bytes())
}

pub fn parse_cookie(header_val: &str, name: &str) -> Option<String> {
    for part in header_val.split(';') {
        let part = part.trim();
        if let Some(rest) = part.strip_prefix(name).and_then(|r| r.strip_prefix('=')) {
            return Some(rest.to_string());
        }
    }
    None
}

pub fn device_label_from_user_agent(ua: &str) -> String {
    let lower = ua.to_lowercase();
    if lower.contains("tizen") || lower.contains("webos") || lower.contains("smarttv") || lower.contains("smart-tv") {
        "Smart TV".to_string()
    } else if lower.contains("android") {
        "Android device".to_string()
    } else if lower.contains("iphone") || lower.contains("ipad") {
        "iOS device".to_string()
    } else {
        "Companion device".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_allowlist_accepts_only_loopback_names_on_the_bound_port() {
        assert!(host_allowed("localhost:8787", 8787, None));
        assert!(host_allowed("LOCALHOST:8787", 8787, None));
        assert!(host_allowed("127.0.0.1:8787", 8787, None));
        assert!(host_allowed("[::1]:8787", 8787, None));
        assert!(!host_allowed("evil.example:8787", 8787, None));
        assert!(!host_allowed("localhost.evil.example:8787", 8787, None));
        assert!(!host_allowed("localhost:8788", 8787, None));
        assert!(!host_allowed("localhost", 8787, None));
        assert!(!host_allowed("", 8787, None));
        assert!(!host_allowed("127.0.0.1:8787@evil", 8787, None));
    }

    #[test]
    fn host_allowlist_accepts_only_this_machines_tailnet_name() {
        let ts = Some("desk.tail1234.ts.net");
        assert!(host_allowed("desk.tail1234.ts.net", 8787, ts));
        assert!(host_allowed("DESK.tail1234.ts.net:443", 8787, ts));
        assert!(!host_allowed("other.tail1234.ts.net", 8787, ts));
        assert!(!host_allowed("desk.tail1234.ts.net.evil.example", 8787, ts));
        assert!(!host_allowed("desk.tail1234.ts.net:8443", 8787, ts));
        assert!(!host_allowed("desk.tail1234.ts.net", 8787, None));
        assert!(!host_allowed("evil.example", 8787, Some("evil.example")));
    }

    #[test]
    fn pairing_codes_use_the_typeable_alphabet() {
        for _ in 0..200 {
            let code = random_pairing_code();
            assert_eq!(code.len(), PAIRING_CODE_LEN);
            assert!(code.bytes().all(|b| PAIRING_ALPHABET.contains(&b)));
        }
        assert_eq!(normalize_pairing_code(" abcd-efgh "), "ABCDEFGH");
    }

    #[test]
    fn sessions_expire_on_age_and_idle() {
        let t0 = 1_000_000;
        assert!(!session_expired(t0, t0, t0 + 60));
        assert!(session_expired(t0, t0 + SESSION_MAX_AGE_SECS, t0 + SESSION_MAX_AGE_SECS + 1));
        assert!(session_expired(t0, t0, t0 + SESSION_IDLE_SECS + 1));
        assert!(!session_expired(t0, t0 + SESSION_IDLE_SECS, t0 + SESSION_IDLE_SECS + 10));
    }

    #[test]
    fn secret_and_token_hash_round_trip() {
        let secret = [7u8; 32];
        assert_eq!(secret_from_hex(&secret_to_hex(&secret)), Some(secret));
        assert_eq!(secret_from_hex("zz"), None);
        assert_ne!(hash_token("a"), hash_token("b"));
        assert_eq!(hash_token("a").len(), 64);
    }

    #[test]
    fn constant_time_eq_matches_plain_equality() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
        assert!(constant_time_eq(b"", b""));
    }
}
