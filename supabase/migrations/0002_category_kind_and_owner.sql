-- Phase 1a: give categories a kind, and an owner.
--
-- `kind` replaces a magic string comparison against the category name
-- "inntekter". It also supplies the fixed/variable split the forecast is built
-- on, and gives savings transfers a bucket so they stop counting as spending.
--
-- `user_id` and row-level security may already exist on the category table.
-- This block is written to be a no-op when they do, and is retained so the
-- migration is correct against a database where they do not. The kind work
-- is the primary goal; user ownership is added or left alone as needed.

alter table category
  add column if not exists kind text not null default 'variable'
  check (kind in ('income','fixed','variable','savings'));

-- The only kind we can infer. Everything else stays 'variable' until the user
-- classifies it in the UI (Phase 3's category editor).
update category set kind = 'income'
  where lower(trim(category)) = 'inntekter';

alter table category
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Single-user back-fill. VERIFY there is exactly one row in auth.users before
-- running this; with more than one it assigns every category to an arbitrary
-- account.
-- Refuse to run unless this is the single-user database this back-fill assumes.
-- Without this guard, a multi-user auth.users would silently reassign every
-- category to one arbitrary account, with no error raised.
do $$
declare
  user_count bigint;
begin
  select count(*) into user_count from auth.users;
  if user_count <> 1 then
    raise exception
      'Refusing to run: auth.users has % rows, expected exactly 1. Assign category.user_id by hand instead.',
      user_count;
  end if;
end $$;

update category set user_id = (select id from auth.users limit 1)
  where user_id is null;

-- Set NOT NULL on user_id if no rows have null owners. If any rows lack an owner,
-- raise an exception and tell the operator to assign owners by hand.
do $$
declare
  null_count bigint;
begin
  select count(*) into null_count from category where user_id is null;
  if null_count = 0 then
    execute 'alter table category alter column user_id set not null';
  else
    raise exception
      'Cannot set user_id NOT NULL: % rows have no owner. Assign category owners by hand.',
      null_count;
  end if;
end $$;

alter table category enable row level security;

-- Create the owner policy if no policy already exists on category. If one does,
-- leave it alone — it may be differently named but doing the same job.
do $$
begin
  if not exists (
    select 1 from pg_policy where polrelid = 'category'::regclass
  ) then
    execute $p$
      create policy category_owner on category
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $p$;
  else
    raise notice 'category already has at least one RLS policy; leaving it alone.';
  end if;
end $$;
