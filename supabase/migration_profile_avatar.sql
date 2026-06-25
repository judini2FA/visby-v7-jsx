-- Profile pictures: an uploaded avatar image URL on a user's profile. The image is uploaded via
-- /api/upload-image to the public item-images bucket; this column just stores the resulting URL.
-- Nullable — the UI falls back to the generated initials avatar when it's absent.
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table public.profiles add column if not exists avatar_url text;

NOTIFY pgrst, 'reload schema';
