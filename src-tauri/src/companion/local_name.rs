use std::net::IpAddr;

pub const FRIENDLY_HOST: &str = "ruforge.local";

pub const HOSTS_FILE_LINE: &str = "127.0.0.1 ruforge.local";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalNameProbe {
    pub resolvable: bool,
    pub loopback_ok: bool,
    pub resolved_ips: Vec<String>,
}

fn is_loopback(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback(),
        IpAddr::V6(v6) => v6.is_loopback(),
    }
}

pub async fn probe_friendly_host() -> LocalNameProbe {
    let resolved = tokio::net::lookup_host((FRIENDLY_HOST, 0)).await;
    match resolved {
        Ok(addrs) => {
            let resolved_ips: Vec<String> = addrs.map(|a| a.ip().to_string()).collect();
            let loopback_ok =
                !resolved_ips.is_empty() && resolved_ips.iter().all(|ip| {
                    ip.parse::<IpAddr>()
                        .map(is_loopback)
                        .unwrap_or(false)
                });
            LocalNameProbe {
                resolvable: !resolved_ips.is_empty(),
                loopback_ok,
                resolved_ips,
            }
        }
        Err(_) => LocalNameProbe {
            resolvable: false,
            loopback_ok: false,
            resolved_ips: Vec::new(),
        },
    }
}

pub fn friendly_browser_url(port: u16) -> String {
    format!("http://{FRIENDLY_HOST}:{port}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_v4_only() {
        assert!(is_loopback("127.0.0.1".parse().unwrap()));
        assert!(!is_loopback("192.168.1.1".parse().unwrap()));
    }
}
