-- Phase 1a follow-up: actually create the owner-scoped category policy.
--
-- 0002's guard skipped creating category_owner if ANY policy already existed
-- on category, on the assumption that an existing policy was doing the same
-- job under a different name. That assumption was wrong: the live database
-- already had a permissive read policy —
--
--   create policy "Users can read categories"
--     on public.category for select to authenticated using (true);
--
-- — documented in README.md, which lets every authenticated user read every
-- row regardless of owner. The guard was too coarse (any policy vs. an
-- owner-scoped one), so it saw that policy and silently left ownership
-- unenforced at the database layer. Nothing has leaked in practice — this is
-- a single-user database today, and the app filters by user_id client-side —
-- but the record should not claim an owner policy exists when it does not.
--
-- Do not edit 0002 to fix this: it is already applied, and editing an applied
-- migration falsifies the history. This file replaces the permissive policy
-- with the owner-scoped one 0002 intended to create.

-- Refuse to run unless every category row already has an owner. Replacing a
-- permissive policy with an owner-scoped one while rows lack user_id would
-- make those rows invisible to everyone, not just leak-proof.
do $$
declare
  null_count bigint;
begin
  select count(*) into null_count from category where user_id is null;
  if null_count <> 0 then
    raise exception
      'Refusing to run: % category rows have no owner (user_id is null). Assign owners before scoping the policy.',
      null_count;
  end if;
end $$;

-- Drop the permissive policy by name, if present.
drop policy if exists "Users can read categories" on category;

-- Create the owner-scoped policy only if a policy of that exact name does not
-- already exist, so this migration stays safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'category'::regclass
      and polname = 'category_owner'
  ) then
    execute $p$
      create policy category_owner on category
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $p$;
  else
    raise notice 'category_owner already exists; leaving it alone.';
  end if;
end $$;

-- Rollback (restores the prior permissive read policy):
--   drop policy if exists category_owner on category;
--   create policy "Users can read categories" on category for select to authenticated using (true);
