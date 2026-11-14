-- Editable Privacy Policy and Terms of Service pages.
-- Additive only: creates one table holding one row per public legal page.
--
-- 1. New table: site_pages (slug, title, html_content, updated_by, updated_at)
-- 2. Seeds the two rows as blank so the public pages render an empty state until written.
-- 3. Reads go through the server API only. The browser never queries this table directly.

CREATE TABLE IF NOT EXISTS public.site_pages (
  slug TEXT PRIMARY KEY CHECK (slug IN ('privacy', 'terms')),
  title TEXT NOT NULL,
  html_content TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.site_pages (slug, title, html_content)
VALUES
  ('privacy', 'Privacy Policy', ''),
  ('terms', 'Terms of Service', '')
ON CONFLICT (slug) DO NOTHING;
