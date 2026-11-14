use sha2::{Digest, Sha256};

pub fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 0x0f) as usize] as char);
    }
    out
}

pub fn finish_hex(hasher: Sha256) -> String {
    hex(&hasher.finalize())
}

/// Finds the hash for `asset` in a `SHA2-256SUMS` body (`<hex>  <name>` or `<hex> *<name>`).
pub fn find_sum(sums: &str, asset: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hash, name) = line.trim().split_once(char::is_whitespace)?;
        let name = name.trim().trim_start_matches('*');
        (name == asset && hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()))
            .then(|| hash.to_ascii_lowercase())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_encodes() {
        assert_eq!(hex(&[0x00, 0xab, 0xff]), "00abff");
    }

    #[test]
    fn finds_sum_line() {
        let h = "a".repeat(64);
        let body = format!("{h}  yt-dlp\n{}  yt-dlp.exe\n{h} *yt-dlp_x86.exe\n", "b".repeat(64));
        assert_eq!(find_sum(&body, "yt-dlp.exe"), Some("b".repeat(64)));
        assert_eq!(find_sum(&body, "yt-dlp_x86.exe"), Some(h));
        assert_eq!(find_sum(&body, "missing"), None);
    }

    #[test]
    fn rejects_short_hash() {
        assert_eq!(find_sum("abc  yt-dlp.exe", "yt-dlp.exe"), None);
    }
}
