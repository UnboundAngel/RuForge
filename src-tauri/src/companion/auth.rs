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

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
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
