-- Phase 3: make a brand-new account usable.
--
-- Until now this was a single-user database, and its one user's categories
-- were created by hand before `category_owner` (0003) scoped the table. There
-- is no code path anywhere in the app that inserts a category outside the new
-- editor on /budsjett — and every form that matters (a transaction, a budget,
-- a fixed expense) needs a category_id to point at. So a fresh signup would
-- land in an app where nothing can be entered and nothing explains why.
--
-- The seed is a starting point, not a fixture: the /budsjett editor can
-- rename, retype and delete every row below.

create or replace function public.seed_default_categories()
returns trigger
language plpgsql
-- security definer because the trigger runs as the auth system rather than as
-- the new user, who has no session yet and so fails category_owner's
-- `user_id = auth.uid()` check. search_path is pinned per Supabase's guidance
-- for definer functions.
security definer
set search_path = public
as $$
begin
  insert into public.category (category, kind, user_id)
  values
    ('Lønn',       'income',   new.id),
    ('Bolig',      'fixed',    new.id),
    ('Strøm',      'fixed',    new.id),
    ('Abonnement', 'fixed',    new.id),
    ('Mat',        'variable', new.id),
    ('Transport',  'variable', new.id),
    ('Klær',       'variable', new.id),
    ('Fritid',     'variable', new.id),
    ('Sparing',    'savings',  new.id);
  return new;
end;
$$;

drop trigger if exists seed_default_categories_on_signup on auth.users;
create trigger seed_default_categories_on_signup
  after insert on auth.users
  for each row execute function public.seed_default_categories();

-- Rollback:
--   drop trigger if exists seed_default_categories_on_signup on auth.users;
--   drop function if exists public.seed_default_categories();
