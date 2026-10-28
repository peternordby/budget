-- Drop the free-text tag columns that 0010 replaced with `tag` + `expense.tag_id`.
--
-- Apply after 0010, once this returns 0 (0010's backfill makes it so):
--   select count(*) from public.expense
--   where tag is not null and btrim(tag) <> '' and tag_id is null;
--
-- Nothing is lost for users who have not opened the app since 0010: their
-- tags already live in `tag`, merely unmerged until their next visit.
--
-- `recurring_expense.tag` goes without a replacement: a fixed monthly expense
-- belonging to one trip made no sense, and the template form no longer has it.

alter table public.expense drop column if exists tag;
alter table public.recurring_expense drop column if exists tag;

-- Rollback (the column comes back empty; the names live on in `tag`):
--   alter table public.expense add column tag text;
--   alter table public.recurring_expense add column tag text;
