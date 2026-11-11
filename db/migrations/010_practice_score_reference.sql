ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS reference_file_id UUID REFERENCES public.user_files(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS practice_sessions_reference_file_idx
  ON public.practice_sessions (reference_file_id) WHERE reference_file_id IS NOT NULL;
