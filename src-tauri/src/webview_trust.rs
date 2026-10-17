//! Which webviews show RuForge's own pages and which show third-party sites, plus the address
//! allowlist for the third-party ones. Pure functions so they can be tested off the app crate.

use tauri::Url;

/// Webviews that load RuForge's bundled frontend. Only these may read local files through the
/// asset protocol; anything unlisted (a new remote webview included) is refused by default.
const APP_WEBVIEW_LABELS: &[&str] = &[
    "main",
    "mini",
    "music-mini",
    "island",
    "notify-overlay",
    "radial-nav-overlay",
];

/// Webviews that load youtube.com / Google sign-in. Their navigations go through
/// [`is_allowed_remote_navigation`].
const REMOTE_WEBVIEW_LABELS: &[&str] = &[
    "explorer-view",
    "music-explore-view",
    "explorer-session-probe",
    "explorer-surface",
    "explorer",
    "explorer-cookie-probe",
];

/// Glance viewers are Games webviews; without Games there are none, so nothing is treated as one.
pub fn is_glance_webview(label: &str) -> bool {
    #[cfg(ruforge_games)]
    {
        crate::games::trust::is_glance_webview(label)
    }
    #[cfg(not(ruforge_games))]
    {
        let _ = label;
        false
    }
}

/// Hostnames that can only mean this machine or the local network fail, as do IPv6 literals.
pub fn public_host(host: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    if h.is_empty() || h == "localhost" || !h.contains('.') {
        return false;
    }
    if [".localhost", ".local", ".internal", ".lan", ".home", ".test", ".home.arpa", ".localdomain"]
        .iter()
        .any(|s| h.ends_with(s))
    {
        return false;
    }
    match h.trim_matches(['[', ']']).parse::<std::net::IpAddr>() {
        Ok(std::net::IpAddr::V6(_)) => false,
        Ok(ip) => public_ip(ip),
        Err(_) => true,
    }
}

pub fn public_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || a == 0
                || a >= 224
                || a == 100 && (64..128).contains(&b)
                || a == 198 && (18..20).contains(&b)
                // IETF protocol assignments, then the three documentation ranges.
                || a == 192 && b == 0 && (c == 0 || c == 2)
                || a == 198 && b == 51 && c == 100
                || a == 203 && b == 0 && c == 113)
        }
        std::net::IpAddr::V6(ip) => {
            if let Some(v4) = embedded_ipv4(ip) {
                return public_ip(std::net::IpAddr::V4(v4));
            }
            let s = ip.segments();
            !(ip.is_loopback()
                || ip.is_unspecified()
                || s[0] & 0xfe00 == 0xfc00
                || s[0] & 0xffc0 == 0xfe80
                || s[0] & 0xffc0 == 0xfec0
                || s[0] & 0xff00 == 0xff00
                || s[0] == 0x64 && s[1] == 0xff9b
                // Documentation: 2001:db8::/32 and 3fff::/20.
                || s[0] == 0x2001 && s[1] == 0x0db8
                || s[0] == 0x3fff && s[1] < 0x1000)
        }
    }
}

/// The IPv4 address an IPv6 one stands for: mapped (`::ffff:a.b.c.d`), translated
/// (`::ffff:0:a.b.c.d`), compatible (`::a.b.c.d`), NAT64 (`64:ff9b::a.b.c.d`) and 6to4
/// (`2002:aabb:ccdd::`). Each can route to the embedded host.
fn embedded_ipv4(ip: std::net::Ipv6Addr) -> Option<std::net::Ipv4Addr> {
    let s = ip.segments();
    let tail = || std::net::Ipv4Addr::new((s[6] >> 8) as u8, s[6] as u8, (s[7] >> 8) as u8, s[7] as u8);
    if let Some(v4) = ip.to_ipv4_mapped() {
        return Some(v4);
    }
    if s[..6] == [0, 0, 0, 0, 0xffff, 0] {
        return Some(tail());
    }
    if s[..6] == [0; 6] && !ip.is_loopback() && !ip.is_unspecified() {
        return Some(tail());
    }
    if s[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return Some(tail());
    }
    if s[0] == 0x2002 {
        return Some(std::net::Ipv4Addr::new((s[1] >> 8) as u8, s[1] as u8, (s[2] >> 8) as u8, s[2] as u8));
    }
    None
}

/// No `user:password@` part at all, a bare password included.
pub fn no_credentials(url: &Url) -> bool {
    url.username().is_empty() && url.password().is_none()
}

pub(crate) fn public_https(url: &Url) -> bool {
    url.scheme() == "https" && url.port().is_none() && no_credentials(url) && url.host_str().is_some_and(public_host)
}

/// Navigation rule for glance webviews. Refuses everything when Games is absent.
pub fn is_allowed_glance_navigation(url: &Url) -> bool {
    #[cfg(ruforge_games)]
    {
        crate::games::trust::is_allowed_glance_navigation(url)
    }
    #[cfg(not(ruforge_games))]
    {
        let _ = url;
        false
    }
}

/// Subframe navigations in the third-party webviews. Top-level navigations go through
/// `nav_guard`, but a page could still frame the app origin, and a frame there gets local IPC.
/// Public https frames (sign-in, embeds, ads) and frames built from the page itself stay allowed.
pub fn is_allowed_frame_navigation(url: &Url) -> bool {
    match url.scheme() {
        "about" => matches!(url.path(), "blank" | "srcdoc"),
        "data" => true,
        "blob" => Url::parse(url.path()).is_ok_and(|inner| public_https(&inner)),
        "https" => public_https(url),
        _ => false,
    }
}

pub fn is_app_webview(label: &str) -> bool {
    #[cfg(ruforge_games)]
    if crate::games::trust::APP_WEBVIEW_LABELS.contains(&label) {
        return true;
    }
    APP_WEBVIEW_LABELS.contains(&label)
}

pub fn is_remote_webview(label: &str) -> bool {
    REMOTE_WEBVIEW_LABELS.contains(&label)
}

/// Name shown in the bell for a blocked navigation.
pub fn remote_surface_name(label: &str) -> &'static str {
    if label == "music-explore-view" {
        "Music"
    } else {
        "Explorer"
    }
}

fn is_country_code(label: &str) -> bool {
    label.len() == 2 && label.bytes().all(|b| b.is_ascii_lowercase())
}

/// `google.com`, `google.de`, `google.co.uk`, `google.com.br` and their subdomains. The label
/// right before the suffix must be exactly `google`, so `evilgoogle.com` and `google.evil.com` fail.
fn is_google_host(host: &str) -> bool {
    let labels: Vec<&str> = host.split('.').collect();
    let Some(idx) = labels.iter().rposition(|l| *l == "google") else {
        return false;
    };
    if labels[..idx].iter().any(|l| l.is_empty()) {
        return false;
    }
    match &labels[idx + 1..] {
        ["com"] => true,
        [cc] => is_country_code(cc),
        ["co" | "com", cc] => is_country_code(cc),
        _ => false,
    }
}

fn is_youtube_host(host: &str) -> bool {
    host == "youtube.com"
        || host == "youtu.be"
        || host
            .strip_suffix(".youtube.com")
            .is_some_and(|sub| !sub.is_empty() && !sub.split('.').any(str::is_empty))
}

/// Top-level navigations the Explorer and Music webviews may make: https YouTube and Google
/// sign-in hosts on the default port, plus `about:blank`. Everything else (the app origin,
/// `asset.localhost`, `ipc.localhost`, `file:`, `data:`, plain http, other sites) is refused.
pub fn is_allowed_remote_navigation(url: &Url) -> bool {
    match url.scheme() {
        "about" => matches!(url.path(), "blank" | "srcdoc"),
        "https" => {
            if url.port().is_some() {
                return false;
            }
            let Some(host) = url.domain() else {
                return false;
            };
            let host = host.to_ascii_lowercase();
            is_youtube_host(&host) || is_google_host(&host)
        }
        _ => false,
    }
}

/// What the bell shows for a blocked address: the host, or the scheme when there is none.
/// Never the path or query, which can carry tokens.
pub fn blocked_target_label(url: &Url) -> String {
    match url.host_str() {
        Some(h) if !h.is_empty() => h.to_ascii_lowercase(),
        _ => format!("{}:", url.scheme()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(raw: &str) -> bool {
        is_allowed_remote_navigation(&Url::parse(raw).unwrap())
    }

    #[test]
    fn youtube_and_google_sign_in_hosts_are_allowed() {
        for raw in [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/",
            "https://music.youtube.com/playlist?list=x",
            "https://m.youtube.com/",
            "https://consent.youtube.com/m?continue=x",
            "https://accounts.youtube.com/accounts/SetSID",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://accounts.google.com/ServiceLogin",
            "https://myaccount.google.com/",
            "https://consent.google.com/",
            "https://www.google.com/sorry/index",
            "https://accounts.google.de/accounts/SetSID",
            "https://www.google.co.uk/",
            "https://accounts.google.com.br/",
            "https://WWW.YOUTUBE.COM/",
            "about:blank",
            "about:srcdoc",
        ] {
            assert!(allowed(raw), "{raw}");
        }
    }

    #[test]
    fn app_origins_local_schemes_and_lookalikes_are_refused() {
        for raw in [
            "http://tauri.localhost/",
            "https://tauri.localhost/",
            "http://localhost:1430/",
            "http://127.0.0.1/",
            "http://asset.localhost/C%3A%5CWindows%5Cwin.ini",
            "http://ipc.localhost/plugin%3Aevent%7Cemit",
            "tauri://localhost/",
            "file:///C:/Windows/win.ini",
            "data:text/html,<script>alert(1)</script>",
            "javascript:alert(1)",
            "http://www.youtube.com/",
            "https://www.youtube.com:8443/",
            "https://evilyoutube.com/",
            "https://youtube.com.evil.io/",
            "https://evilgoogle.com/",
            "https://google.evil.com/",
            "https://google.com.evil.io/",
            "https://accounts.google.co.evil/",
            "https://www.google.xyz/",
            "https://example.com/",
            "https://[::1]/",
            "https://142.250.0.1/",
            "about:config",
            "ms-settings:sound",
            "blob:https://www.youtube.com/0000",
        ] {
            assert!(!allowed(raw), "{raw}");
        }
    }

    #[test]
    fn blocked_label_drops_path_and_query() {
        let url = Url::parse("http://localhost:1430/index.html?token=secret").unwrap();
        assert_eq!(blocked_target_label(&url), "localhost");
        let url = Url::parse("file:///C:/Users/x/secret.txt").unwrap();
        assert_eq!(blocked_target_label(&url), "file:");
        let url = Url::parse("data:text/html,hi").unwrap();
        assert_eq!(blocked_target_label(&url), "data:");
    }

    #[test]
    fn keeps_off_private_hosts() {
        assert!(public_host("minecraft.wiki"));
        assert!(!public_host("localhost"));
        assert!(!public_host("192.168.1.4"));
        assert!(!public_host("100.64.0.1"));
        assert!(!public_host("router.local"));
        assert!(!public_ip("::ffff:10.0.0.1".parse().unwrap()));
        assert!(!public_ip("fd00::1".parse().unwrap()));
        assert!(public_ip("2606:4700::1".parse().unwrap()));
        assert!(!public_host("corp.home.arpa"));
        assert!(!public_host("printer.localdomain"));
    }

    #[test]
    fn reserved_and_tunnelled_addresses_are_private() {
        for ip in [
            "0.1.2.3",
            "0.0.0.0",
            "224.0.0.1",
            "239.255.255.250",
            "240.0.0.1",
            "255.255.255.255",
            "198.18.0.1",
            "198.19.255.255",
            "64:ff9b::7f00:1",
            "64:ff9b::c0a8:101",
            "2002:7f00:1::",
            "2002:c0a8:101::1",
            "::7f00:1",
            "::a00:1",
            "ff02::1",
            "fec0::1",
            "::",
            "::ffff:0:7f00:1",
            "::ffff:0:a00:1",
            "192.0.0.8",
            "192.0.2.1",
            "198.51.100.7",
            "203.0.113.255",
            "2001:db8::1",
            "3fff:fff::1",
        ] {
            assert!(!public_ip(ip.parse().unwrap()), "{ip}");
        }
        for ip in [
            "8.8.8.8",
            "198.20.0.1",
            "223.255.255.1",
            "64:ff9b::808:808",
            "2002:808:808::1",
            "2001:4860::8888",
            "::ffff:0:808:808",
            "192.0.1.1",
            "198.51.101.1",
            "203.0.114.1",
            "2001:db9::1",
            "3fff:1000::1",
        ] {
            assert!(public_ip(ip.parse().unwrap()), "{ip}");
        }
    }

    #[test]
    fn frames_stay_public_and_off_the_app_origin() {
        let ok = |raw: &str| is_allowed_frame_navigation(&Url::parse(raw).unwrap());
        for raw in [
            "https://accounts.google.com/RotateCookiesPage",
            "https://www.youtube.com/embed/x",
            "https://googleads.g.doubleclick.net/pagead/x",
            "about:blank",
            "about:srcdoc",
            "data:text/html,hi",
            "blob:https://www.youtube.com/0000",
        ] {
            assert!(ok(raw), "{raw}");
        }
        for raw in [
            "http://tauri.localhost/",
            "https://tauri.localhost/",
            "http://ipc.localhost/plugin%3Aevent%7Cemit",
            "http://asset.localhost/C%3A%5Cx",
            "tauri://localhost/",
            "http://localhost:1430/",
            "http://example.com/",
            "https://example.com:8443/",
            "https://:pw@example.com/",
            "https://192.168.1.1/",
            "file:///C:/Windows/win.ini",
            "blob:http://tauri.localhost/0000",
            "steam://run/1",
            "ms-settings:sound",
            "about:config",
            "about:settings",
            "about:flags",
        ] {
            assert!(!ok(raw), "{raw}");
        }
    }

    #[test]
    fn label_lists_do_not_overlap() {
        for label in REMOTE_WEBVIEW_LABELS {
            assert!(!is_app_webview(label), "{label}");
        }
        assert!(is_remote_webview("music-explore-view"));
        assert!(!is_remote_webview("main"));
        assert_eq!(remote_surface_name("music-explore-view"), "Music");
        assert_eq!(remote_surface_name("explorer-view"), "Explorer");
    }
}
