-- Persistent student-owned Grade Plan tasks, section history and accessibility preferences.
-- Additive only: existing users, files and practice sessions remain intact.
ALTER TABLE public.student_preferences ADD COLUMN IF NOT EXISTS font_size TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS public.practice_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT NOT NULL REFERENCES public.users(firebase_uid) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('pieces','exercises','scales')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  composer TEXT,
  notes TEXT,
  source_file_id UUID REFERENCES public.user_files(id) ON DELETE SET NULL,
  section_count INTEGER NOT NULL DEFAULT 1 CHECK (section_count BETWEEN 1 AND 100),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS practice_tasks_owner_category_idx
  ON public.practice_tasks (firebase_uid, category, created_at);

ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS section_key TEXT,
  ADD COLUMN IF NOT EXISTS feedback JSONB,
  ADD COLUMN IF NOT EXISTS recording_file_id UUID REFERENCES public.user_files(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.practice_task_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT NOT NULL REFERENCES public.users(firebase_uid) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.practice_tasks(id) ON DELETE CASCADE,
  session_id UUID NOT NULL UNIQUE REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL DEFAULT 'full',
  score NUMERIC(5,2),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS practice_task_attempts_owner_task_time_idx
  ON public.practice_task_attempts (firebase_uid, task_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS practice_task_attempts_section_time_idx
  ON public.practice_task_attempts (task_id, section_key, attempted_at DESC);
