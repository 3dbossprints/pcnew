-- Short-lived, single-use email confirmation codes for account deletion.
-- Additive only. Account deletion remains scheduled with the existing grace period.

CREATE TABLE IF NOT EXISTS public.account_deletion_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT NOT NULL REFERENCES public.users(firebase_uid) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_deletion_codes_lookup_idx
  ON public.account_deletion_codes(firebase_uid, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_codes_one_pending_idx
  ON public.account_deletion_codes(firebase_uid)
  WHERE consumed_at IS NULL;
