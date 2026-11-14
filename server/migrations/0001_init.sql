-- The Weekly Echo boards.
CREATE TABLE players (
  id TEXT PRIMARY KEY,              -- random, public (shown in board responses so a client can find itself)
  name TEXT NOT NULL,               -- display name as typed
  name_key TEXT NOT NULL UNIQUE,    -- lower case without spaces, to stop look-alike names
  token_hash TEXT NOT NULL,         -- SHA-256 of the secret token; the token itself is never stored
  created INTEGER NOT NULL,
  renamed_week INTEGER NOT NULL DEFAULT -1,
  banned INTEGER NOT NULL DEFAULT 0
);

-- Each player's best run per week and subclass.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  week INTEGER NOT NULL,
  player TEXT NOT NULL REFERENCES players(id),
  cls TEXT NOT NULL,
  spec TEXT NOT NULL,
  floor INTEGER NOT NULL,
  clear_tick INTEGER NOT NULL,
  end_tick INTEGER NOT NULL,
  status TEXT NOT NULL,             -- verified | pending | rejected
  version TEXT NOT NULL,
  build TEXT NOT NULL,              -- JSON
  inputs TEXT,                      -- JSON { enc, data }: the recording, kept for checking and watching
  submitted INTEGER NOT NULL,
  verified INTEGER,
  UNIQUE (week, player, spec)
);
CREATE INDEX runs_board ON runs (week, spec, status, floor DESC, clear_tick ASC, submitted ASC);
CREATE INDEX runs_pending ON runs (status, submitted);

-- How much replay checking was done each day (the spending cap).
CREATE TABLE budget (
  day TEXT PRIMARY KEY,             -- YYYY-MM-DD (UTC)
  checks INTEGER NOT NULL DEFAULT 0,
  ticks INTEGER NOT NULL DEFAULT 0
);

-- Rate limits: requests per key (a player, or a hashed network address) per hour.
CREATE TABLE limits (
  key TEXT NOT NULL,
  hour INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (key, hour)
);
