-- Keep exam-board access separate from a student's personal Pro repertoire.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS exam_book_file_id uuid;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS exam_book_skipped boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS exam_book_uploaded_at timestamptz;

CREATE INDEX IF NOT EXISTS users_exam_book_file_idx
  ON public.users (exam_book_file_id);
