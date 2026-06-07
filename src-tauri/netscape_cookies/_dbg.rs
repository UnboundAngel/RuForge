use cookie::Cookie;
fn main() {
    let c = Cookie::build(("SID", "v")).domain(".youtube.com").path("/").build();
    println!("domain={:?} domain_raw={:?}", c.domain(), c.domain_raw());
    let p = Cookie::parse("LOGIN_INFO=x; Domain=.youtube.com; Path=/; Secure; HttpOnly").unwrap();
    println!("parsed domain={:?} raw={:?}", p.domain(), p.domain_raw());
}
