use roxmltree::{Document, Node};

#[derive(Clone, Debug, PartialEq)]
pub struct FeedEntry {
    pub video_id: String,
    pub channel_id: String,
    pub channel_title: String,
    pub title: String,
    pub published_at: i64,
    pub short: bool,
}

#[derive(Debug)]
pub enum FeedError {
    NotFound,
    Transient(String),
}

fn child<'a, 'i>(node: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    node.children()
        .find(|c| c.is_element() && c.tag_name().name() == name)
}

fn child_text(node: Node, name: &str) -> Option<String> {
    child(node, name)
        .and_then(|c| c.text())
        .map(|t| t.trim().to_string())
}

fn parse_entry(entry: Node) -> Option<FeedEntry> {
    let video_id = child_text(entry, "videoId").filter(|v| !v.is_empty())?;
    let href = entry
        .children()
        .filter(|c| c.is_element() && c.tag_name().name() == "link")
        .find(|c| c.attribute("rel").map_or(true, |r| r == "alternate"))
        .and_then(|c| c.attribute("href"))
        .unwrap_or_default();
    // An unparsable date still records the id so it never resurfaces; 0 fails the new-upload age check.
    let published_at = child_text(entry, "published")
        .and_then(|p| chrono::DateTime::parse_from_rfc3339(&p).ok())
        .map_or(0, |d| d.timestamp());
    Some(FeedEntry {
        video_id,
        channel_id: child_text(entry, "channelId").unwrap_or_default(),
        channel_title: child(entry, "author")
            .and_then(|a| child_text(a, "name"))
            .unwrap_or_default(),
        title: child_text(entry, "title").unwrap_or_default(),
        published_at,
        short: href.contains("/shorts/"),
    })
}

/// Direct children only: `media:group` nests a second `title` inside every entry.
pub fn parse_channel_feed(xml: &str) -> Result<Vec<FeedEntry>, String> {
    let doc = Document::parse(xml).map_err(|e| format!("Invalid channel feed: {e}"))?;
    Ok(doc
        .root_element()
        .children()
        .filter(|c| c.is_element() && c.tag_name().name() == "entry")
        .filter_map(parse_entry)
        .collect())
}

pub fn parse_feed_title(xml: &str) -> Option<String> {
    let doc = Document::parse(xml).ok()?;
    child_text(doc.root_element(), "title").filter(|t| !t.is_empty())
}

pub async fn fetch_channel_feed(
    client: &reqwest::Client,
    channel_id: &str,
) -> Result<(Vec<FeedEntry>, Option<String>), FeedError> {
    let res = client
        .get(format!(
            "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        ))
        .send()
        .await
        .map_err(|e| FeedError::Transient(e.to_string()))?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(FeedError::NotFound);
    }
    if !res.status().is_success() {
        return Err(FeedError::Transient(format!("HTTP {}", res.status())));
    }
    let xml = res
        .text()
        .await
        .map_err(|e| FeedError::Transient(e.to_string()))?;
    let entries = parse_channel_feed(&xml).map_err(FeedError::Transient)?;
    Ok((entries, parse_feed_title(&xml)))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) const FIXTURE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCY-PrcA-mjq3OhgsAH9C52A"/>
 <id>yt:channel:Y-PrcA-mjq3OhgsAH9C52A</id>
 <yt:channelId>Y-PrcA-mjq3OhgsAH9C52A</yt:channelId>
 <title>Tom &amp; Friends</title>
 <link rel="alternate" href="https://www.youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A"/>
 <author><name>Tom &amp; Friends</name><uri>https://www.youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A</uri></author>
 <published>2015-01-01T00:00:00+00:00</published>
 <entry>
  <id>yt:video:aaaaaaaaaaa</id>
  <yt:videoId>aaaaaaaaaaa</yt:videoId>
  <yt:channelId>UCY-PrcA-mjq3OhgsAH9C52A</yt:channelId>
  <title>Rock &amp; Roll</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/>
  <author><name>Tom &amp; Friends</name><uri>https://www.youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A</uri></author>
  <published>2026-09-20T12:00:00+00:00</published>
  <updated>2026-09-20T13:00:00+00:00</updated>
  <media:group><media:title>Media title should be ignored</media:title></media:group>
 </entry>
 <entry>
  <id>yt:video:bbbbbbbbbbb</id>
  <yt:videoId>bbbbbbbbbbb</yt:videoId>
  <yt:channelId>UCY-PrcA-mjq3OhgsAH9C52A</yt:channelId>
  <title>A short</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/bbbbbbbbbbb"/>
  <author><name>Tom &amp; Friends</name><uri>https://www.youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A</uri></author>
  <published>2026-09-19T12:00:00+00:00</published>
 </entry>
 <entry>
  <id>yt:video:ccccccccccc</id>
  <yt:videoId>ccccccccccc</yt:videoId>
  <yt:channelId>UCY-PrcA-mjq3OhgsAH9C52A</yt:channelId>
  <title>Old video</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=ccccccccccc"/>
  <author><name>Tom &amp; Friends</name><uri>https://www.youtube.com/channel/UCY-PrcA-mjq3OhgsAH9C52A</uri></author>
  <published>2020-01-01T00:00:00+00:00</published>
 </entry>
</feed>"#;

    #[test]
    fn watchlist_feed_parses_entries() {
        let entries = parse_channel_feed(FIXTURE).unwrap();
        assert_eq!(entries.len(), 3);
        let first = &entries[0];
        assert_eq!(first.video_id, "aaaaaaaaaaa");
        assert_eq!(first.channel_id, "UCY-PrcA-mjq3OhgsAH9C52A");
        assert_eq!(first.channel_title, "Tom & Friends");
        assert_eq!(first.title, "Rock & Roll");
        assert_eq!(first.published_at, 1_789_905_600);
        assert!(!first.short);
        assert!(entries[1].short);
        assert!(!entries[2].short);
    }

    #[test]
    fn watchlist_feed_title() {
        assert_eq!(parse_feed_title(FIXTURE).as_deref(), Some("Tom & Friends"));
        assert_eq!(parse_feed_title("<feed></feed>"), None);
    }

    #[test]
    fn watchlist_feed_rejects_junk() {
        assert!(parse_channel_feed("not xml").is_err());
        assert!(parse_channel_feed("<feed/>").unwrap().is_empty());
    }
}
