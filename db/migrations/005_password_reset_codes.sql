CREATE TABLE IF NOT EXISTS password_reset_codes (
  firebase_uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  link_token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  hour_requests INTEGER NOT NULL DEFAULT 1,
  hour_window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_codes_expiry_idx ON password_reset_codes (expires_at);
