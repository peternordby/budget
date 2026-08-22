-- expense is the last table still on four granular policies instead of the
-- single owner-scoped ALL policy every other table has (category_owner,
-- budget_owner, recurring_expense_owner, "savings_snapshot is per user").
--
-- The gap that matters: "Users can update their expenses" has no with_check,
-- only a using clause. That means an update is allowed onto any *existing*
-- row you own, but the *new* row isn't checked — you could
-- UPDATE expense SET user_id = '<other-uuid>' on your own row and it would
-- pass, silently reassigning ownership. expense_owner closes that by
-- checking user_id = auth.uid() on both sides, like the rest of the tables.

drop policy if exists "Users can update their expenses" on expense;
drop policy if exists "Enable delete for users based on user_id" on expense;
drop policy if exists "Enable users to view their own data only" on expense;
drop policy if exists "Enable insert for users based on user_id" on expense;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'expense'::regclass
      and polname = 'expense_owner'
  ) then
    execute $p$
      create policy expense_owner on expense
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $p$;
  else
    raise notice 'expense_owner already exists; leaving it alone.';
  end if;
end $$;

-- Cleanup: category_owner and budget_owner already cover every command;
-- these older per-command policies are redundant duplicates left behind when
-- 0003/0006 added the ALL policy but only dropped the specifically-named
-- pre-existing ones. Not a security issue (same user_id = auth.uid() check),
-- just noise.
drop policy if exists "Enable insert for users based on user_id" on category;
drop policy if exists "Enable delete for users based on user_id" on category;
drop policy if exists "Enable users to view their own data only" on category;

drop policy if exists "Enable insert for users based on user_id" on budget;
drop policy if exists "Enable update for users based on user_id" on budget;
drop policy if exists "Enable delete for users based on user_id" on budget;
drop policy if exists "Enable users to view their own data only" on budget;

-- Rollback:
--   drop policy if exists expense_owner on expense;
--   create policy "Users can update their expenses" on expense for update to authenticated using (user_id = auth.uid());
--   create policy "Enable delete for users based on user_id" on expense for delete to public using ((select auth.uid()) = user_id);
--   create policy "Enable users to view their own data only" on expense for select to authenticated using ((select auth.uid()) = user_id);
--   create policy "Enable insert for users based on user_id" on expense for insert to public with check ((select auth.uid()) = user_id);
--   (category/budget duplicates are gone for good; re-create by hand from their original migrations if ever needed)
