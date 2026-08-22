-- Phase 2 prerequisite: give `budget` the owner scoping every other table has.
--
-- README.md documents the live policies as:
--
--   create policy "Users can read budgets"   on public.budget for select to authenticated using (true);
--   create policy "Users can upsert budgets" on public.budget for insert to authenticated with check (true);
--   create policy "Users can update budgets" on public.budget for update to authenticated using (true);
--
-- Every authenticated user can therefore read and overwrite every other
-- user's budgets. That has never mattered — this is a single-user database and
-- the app both writes `user_id` and filters on it client-side — but it stops
-- being harmless the moment public signup exists, which is why this lands
-- before the auth work rather than after it. Same class of bug, and same fix,
-- as 0003 for `category`.
--
-- The unique index is the second half: the budget page has always assumed one
-- row per (user, category, year, month) and enforced it with a
-- find-then-update-or-insert dance in the client. Stating it in the schema
-- lets that collapse into a single upsert, and closes the race where two
-- tabs each find nothing and both insert.

alter table budget
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Refuse to run on unowned rows. Setting NOT NULL would fail anyway, but the
-- owner-scoped policy below would make them invisible to everyone first.
do $$
declare
  null_count bigint;
begin
  select count(*) into null_count from budget where user_id is null;
  if null_count <> 0 then
    raise exception
      'Refusing to run: % budget rows have no owner (user_id is null). Assign owners before scoping the policy.',
      null_count;
  end if;
end $$;

-- Refuse to run on duplicates rather than letting the unique index fail with
-- a message that names an index instead of the problem.
do $$
declare
  dupe_count bigint;
begin
  select count(*) into dupe_count from (
    select 1 from budget
    group by user_id, category_id, year, month
    having count(*) > 1
  ) as dupes;
  if dupe_count <> 0 then
    raise exception
      'Refusing to run: % (user, category, year, month) groups have more than one budget row. Merge them before adding the unique index.',
      dupe_count;
  end if;
end $$;

alter table budget alter column user_id set not null;
-- Matches savings_snapshot (0005): the client may still send user_id, but it
-- no longer has to be the only thing keeping the column correct.
alter table budget alter column user_id set default auth.uid();

create unique index if not exists budget_user_cat_period_idx
  on budget (user_id, category_id, year, month);

drop policy if exists "Users can read budgets" on budget;
drop policy if exists "Users can upsert budgets" on budget;
drop policy if exists "Users can update budgets" on budget;

-- `for all` rather than three policies: it also supplies the DELETE the budget
-- page needs to clear a budget, instead of storing a 0 that reads as "budgeted
-- nothing" when the truth is "not budgeted".
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'budget'::regclass
      and polname = 'budget_owner'
  ) then
    execute $p$
      create policy budget_owner on budget
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $p$;
  else
    raise notice 'budget_owner already exists; leaving it alone.';
  end if;
end $$;

-- Rollback (restores the prior permissive policies):
--   drop policy if exists budget_owner on budget;
--   drop index if exists budget_user_cat_period_idx;
--   alter table budget alter column user_id drop not null;
--   alter table budget alter column user_id drop default;
--   create policy "Users can read budgets"   on public.budget for select to authenticated using (true);
--   create policy "Users can upsert budgets" on public.budget for insert to authenticated with check (true);
--   create policy "Users can update budgets" on public.budget for update to authenticated using (true);
