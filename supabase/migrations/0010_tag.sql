-- Merkelapper become a table: a trip or a project with a name, optional dates
-- and an optional budget, which expenses point at by id.
--
-- Until now `expense.tag` was free text, so a trip had no dates of its own and
-- /innsikt guessed them from the first and last purchase — a flight booked in
-- March stretched a July trip to four months and made "per dag" meaningless.
--
-- `name` and `budget` are encrypted in the browser like `expense.item`/`price`
-- (lib/crypto.ts); the dates are readable, as `expense.date` already is.
--
-- The backfill below has to work without reading the names: they are AES-GCM
-- ciphertext with a random IV, so "Roma" on ten expenses is ten different
-- strings to the database. It therefore creates one tag per tagged expense,
-- copying the ciphertext (which still decrypts — no associated data binds it
-- to its column) and taking the expense's date as both ends. The app merges
-- tags that decrypt to the same name the next time each user opens it
-- (mergeTags in components/LedgerProvider.tsx), widening the dates to the
-- first and last purchase. Until then a user's tags are fragmented, not lost.
--
-- Safe to run twice: everything is "if not exists", and the backfill only
-- touches expenses that have no tag_id yet.

create table if not exists public.tag (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  -- Both or neither. A null comparison passes a check, so the second clause
  -- only bites when both dates are set.
  start_date date,
  end_date date,
  -- Encrypted whole kroner, like budget.budget.
  budget text,
  created_at timestamptz not null default now(),
  constraint tag_dates_check check (
    (start_date is null) = (end_date is null) and end_date >= start_date
  )
);

create index if not exists tag_user_idx on public.tag (user_id);

alter table public.tag enable row level security;

drop policy if exists tag_owner on public.tag;
create policy tag_owner on public.tag
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Deleting a merkelapp keeps its expenses; they just lose the label.
alter table public.expense
  add column if not exists tag_id bigint references public.tag (id) on delete set null;

create index if not exists expense_tag_idx on public.expense (tag_id);

-- One tag per tagged expense. ponytail: row by row, fine for a personal
-- ledger's few hundred tagged rows; a set-based insert needs a mapping column.
do $$
declare
  r record;
  new_id bigint;
begin
  for r in
    select id, user_id, tag, date
    from public.expense
    where tag is not null and btrim(tag) <> '' and tag_id is null
  loop
    insert into public.tag (user_id, name, start_date, end_date)
    values (r.user_id, r.tag, r.date, r.date)
    returning id into new_id;

    update public.expense set tag_id = new_id where id = r.id;
  end loop;
end $$;

-- Check: must return 0 before 0011 drops the old column.
--   select count(*) from public.expense
--   where tag is not null and btrim(tag) <> '' and tag_id is null;

-- Rollback:
--   alter table public.expense drop column if exists tag_id;
--   drop table if exists public.tag;
