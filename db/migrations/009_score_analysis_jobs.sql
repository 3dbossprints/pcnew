-- Async optical music recognition jobs for PDF/EPUB score analysis.
CREATE TABLE IF NOT EXISTS public.score_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT NOT NULL REFERENCES public.users(firebase_uid) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.user_files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'needs_review', 'failed')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS score_analysis_jobs_owner_created_idx
  ON public.score_analysis_jobs (firebase_uid, created_at DESC);
