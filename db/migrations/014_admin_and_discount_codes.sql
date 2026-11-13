-- Database-backed owner/admin access, Stripe discount codes and an audit trail.
-- Additive only. Review and apply through the normal migration approval process.

CREATE TABLE IF NOT EXISTS public.admin_users (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- These two verified owner addresses are the initial Piano Coach administrators.
INSERT INTO public.admin_users(email,role,active)
VALUES
  ('avijit.tirumalasetti16@gmail.com','owner',TRUE),
  ('3dbossuk@gmail.com','owner',TRUE)
ON CONFLICT (email) DO UPDATE SET role='owner',active=TRUE,updated_at=NOW();

CREATE TABLE IF NOT EXISTS public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code = upper(code) AND char_length(code) BETWEEN 4 AND 24),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','amount')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  duration TEXT NOT NULL CHECK (duration IN ('once','repeating','forever')),
  duration_in_months INTEGER,
  allowed_email TEXT,
  stripe_coupon_id TEXT NOT NULL UNIQUE,
  stripe_promotion_code_id TEXT NOT NULL UNIQUE,
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count INTEGER NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL REFERENCES public.admin_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((duration = 'repeating' AND duration_in_months BETWEEN 1 AND 12) OR (duration <> 'repeating' AND duration_in_months IS NULL)),
  CHECK (discount_type <> 'percent' OR discount_value <= 100)
);
CREATE INDEX IF NOT EXISTS discount_codes_active_created_idx
  ON public.discount_codes(active,created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL REFERENCES public.admin_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON public.admin_audit_logs(created_at DESC);
