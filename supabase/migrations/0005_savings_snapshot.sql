-- Replace savings *goals* with savings *snapshots*.
--
-- The goal feature (0004) described a target and derived progress from the sum
-- of savings-kind expenses tagged with the goal's name. That only ever worked
-- for money this ledger saw pass through it, and it cannot describe a holding
-- whose value moves on its own: a fund is worth what the market says today,
-- not the sum of the deposits made into it.
--
-- A snapshot is the opposite shape — an observed balance for one savings
-- category on one date. Nothing derives it from `expense`, so this table is
-- fully independent of the transaction ledger.
--
-- 0004 is already applied; per this project's convention it is not edited.
-- This migration drops what it created.

drop table if exists public.goal;

-- `category` is free text rather than a foreign key to a `savings_category`
-- table: a category exists exactly when it has at least one snapshot, so a
-- separate parent table would carry no information the snapshots don't. The
-- unique constraint is what keeps the set of names tidy — one row per
-- (category, date) means re-importing a CSV updates rather than duplicates.
create table if not exists public.savings_snapshot (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (length(trim(category)) > 0),
  date date not null,
  -- Whole kroner, matching expense.price. A balance can legitimately be 0 (an
  -- emptied account is worth recording), so this is >= 0 rather than > 0.
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category, date)
);

-- Every read is "this user's snapshots, oldest to newest".
create index if not exists savings_snapshot_user_date_idx
  on public.savings_snapshot (user_id, date);

alter table public.savings_snapshot enable row level security;

drop policy if exists "savings_snapshot is per user" on public.savings_snapshot;
create policy "savings_snapshot is per user" on public.savings_snapshot
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Rollback:
--   drop table if exists public.savings_snapshot;
--   (and re-run 0004_goal.sql to restore the goal table)
