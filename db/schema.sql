PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS riders (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  number TEXT DEFAULT '',
  plate TEXT DEFAULT '',
  last TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending',
  next TEXT DEFAULT '',
  comment TEXT DEFAULT '',
  created_at INTEGER DEFAULT 0,
  sheet_id TEXT DEFAULT 'default',
  assigned_to TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  status_updated_at INTEGER DEFAULT 0,
  comment_updated_at INTEGER DEFAULT 0,
  next_updated_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0,
  updated_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sheets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS call_history (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  sheet_id TEXT DEFAULT 'default',
  action TEXT NOT NULL,
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  created_at INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES ('default','Calling Sheet',strftime('%s','now')*1000);
INSERT OR IGNORE INTO sheets (id,name,created_at) VALUES ('unassigned','Unassigned',strftime('%s','now')*1000);
