ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_cancelled_at timestamptz;
