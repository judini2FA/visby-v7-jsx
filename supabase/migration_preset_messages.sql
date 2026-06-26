-- Phase 3 — preset-only messaging. messages.preset stores the structured quick-reply payload
-- (yes/no reply, offer amount, condition answer/question); messages.content keeps a human-readable
-- fallback so the conversation-list preview and any older client still render. Idempotent.
-- Run in the Supabase SQL editor (project rwdwzigqtfezbyqkfqfx) -> Run.

alter table public.messages add column if not exists preset jsonb;

NOTIFY pgrst, 'reload schema';
