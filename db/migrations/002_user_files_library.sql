-- Applied to Neon project pianocoach / database neondb.
-- Add metadata needed to manage a private student sheet-music and audio library.
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'sheet';
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS user_files_kind_owner_created_idx
  ON public.user_files (firebase_uid, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS user_files_status_created_idx
  ON public.user_files (status, created_at);

DO $$ BEGIN
  ALTER TABLE public.user_files ADD CONSTRAINT user_files_kind_check
    CHECK (kind IN ('sheet', 'image', 'audio'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
