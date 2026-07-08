-- 12b POL1: keep items.transfer_count accurate as an OWNERSHIP-EVENT count (mint + every transfer),
-- so person1 → person2 → person1 reads "3 owners", not a deduped-wallet undercount. A trigger on
-- ownership_history covers every insert site (mint, fulfill, tally transfer, sdk mint) at once, so no
-- app code has to remember to increment it.

create or replace function public.sync_item_transfer_count() returns trigger
  language plpgsql security definer as $$
begin
  update public.items
     set transfer_count = (select count(*) from public.ownership_history where item_id = new.item_id)
   where id = new.item_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_transfer_count on public.ownership_history;
create trigger trg_sync_transfer_count
  after insert on public.ownership_history
  for each row execute function public.sync_item_transfer_count();

-- Backfill existing rows so the count is correct immediately, not just for future events.
update public.items i
   set transfer_count = (select count(*) from public.ownership_history oh where oh.item_id = i.id);
