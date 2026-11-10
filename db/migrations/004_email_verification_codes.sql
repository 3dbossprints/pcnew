CREATE TABLE IF NOT EXISTS email_verification_codes (
  firebase_uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS email_verification_codes_expiry_idx
  ON email_verification_codes (expires_at);

ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS hour_requests INTEGER NOT NULL DEFAULT 1;
ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS hour_window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
