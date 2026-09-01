-- Run this once on your Neon database (via the Neon SQL Editor, or `psql "$DATABASE_URL" -f schema.sql`)
-- Creates the tables that api/auth.js and api/data.js expect.

CREATE TABLE IF NOT EXISTS accounts (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kv_store (
  username   TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (username, key)
);

-- Added for real Web Push notifications (see api/push.js and api/send-reminders.js).
-- Run this too if you already had the app deployed before this update.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  username     TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  subscription JSONB NOT NULL,
  tz           TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (username, endpoint)
);
