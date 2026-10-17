CREATE TABLE IF NOT EXISTS votes (
  poll_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  option_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, voter)
);

CREATE INDEX IF NOT EXISTS votes_poll_idx ON votes (poll_id);

CREATE TABLE IF NOT EXISTS ip_counts (
  poll_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poll_id, ip_hash, day)
);
