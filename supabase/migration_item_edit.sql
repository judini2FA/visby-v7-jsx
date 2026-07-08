-- 12b L2: owner editing of a live listing — ADD-only additional photos + description.
-- Title/name and the original cover image_url are intentionally never touched by this feature.

alter table items
  add column if not exists extra_image_urls text[] not null default '{}';

comment on column items.extra_image_urls is
  'Owner-added photos appended after mint/listing. Append-only from the item page — the original image_url and any prior entries are never removed or replaced.';
