-- A row may only point at rows of its own owner.
--
-- Every policy checks `user_id = auth.uid()` on the row being written, but a
-- foreign key is checked by Postgres without RLS, so until now an expense could
-- name *another* user's category_id, tag_id or recurring_id and the insert went
-- through. Nothing leaked — an embedded `category(...)` is still filtered by
-- RLS — but with open signup any account could probe which ids exist (insert
-- succeeds vs. foreign-key error), and pin someone else's category so it could
-- never be deleted.
--
-- The fix is in the keys themselves: each reference now includes user_id, so
-- `(category_id, user_id)` must match a category with that id *and* that owner.
-- That needs `unique (id, user_id)` on each referenced table (redundant with the
-- primary key as a constraint, but a composite key can only point at one).
--
-- `on delete set null (tag_id)` — the column list is Postgres 15+ — keeps the
-- old behaviour of the single-column keys: deleting a merkelapp or a template
-- clears the reference and leaves user_id alone (setting both to null would
-- fail user_id's not null, and orphan the row from its owner).
--
-- Safe to run twice.

-- Refuse to run if a cross-owner reference already exists: the new keys would
-- fail on it with a message that names a constraint instead of the rows.
do $$
declare
  bad bigint;
begin
  select
    (select count(*) from public.expense e join public.category c on c.id = e.category_id where c.user_id is distinct from e.user_id)
  + (select count(*) from public.expense e join public.tag t on t.id = e.tag_id where t.user_id is distinct from e.user_id)
  + (select count(*) from public.expense e join public.recurring_expense r on r.id = e.recurring_id where r.user_id is distinct from e.user_id)
  + (select count(*) from public.recurring_expense r join public.category c on c.id = r.category_id where c.user_id is distinct from r.user_id)
  + (select count(*) from public.budget b join public.category c on c.id = b.category_id where c.user_id is distinct from b.user_id)
  into bad;
  if bad <> 0 then
    raise exception
      'Refusing to run: % rows reference a row owned by another user (or by none). Fix them before adding the same-owner keys.',
      bad;
  end if;
end $$;

-- The targets for the composite keys.
do $$
declare
  t text;
begin
  foreach t in array array['category', 'tag', 'recurring_expense'] loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', t)::regclass and conname = t || '_id_user_key'
    ) then
      execute format('alter table public.%I add constraint %I unique (id, user_id)', t, t || '_id_user_key');
    end if;
  end loop;
end $$;

-- Drop the single-column foreign keys, whatever they are called: the base
-- tables were created by hand, so their constraint names are not on record.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and (c.conrelid, a.attname) in (
        ('public.expense'::regclass, 'category_id'),
        ('public.expense'::regclass, 'tag_id'),
        ('public.expense'::regclass, 'recurring_id'),
        ('public.recurring_expense'::regclass, 'category_id'),
        ('public.budget'::regclass, 'category_id')
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.expense drop constraint if exists expense_category_same_owner;
alter table public.expense add constraint expense_category_same_owner
  foreign key (category_id, user_id) references public.category (id, user_id);

alter table public.expense drop constraint if exists expense_tag_same_owner;
alter table public.expense add constraint expense_tag_same_owner
  foreign key (tag_id, user_id) references public.tag (id, user_id)
  on delete set null (tag_id);

alter table public.expense drop constraint if exists expense_recurring_same_owner;
alter table public.expense add constraint expense_recurring_same_owner
  foreign key (recurring_id, user_id) references public.recurring_expense (id, user_id)
  on delete set null (recurring_id);

alter table public.recurring_expense drop constraint if exists recurring_expense_category_same_owner;
alter table public.recurring_expense add constraint recurring_expense_category_same_owner
  foreign key (category_id, user_id) references public.category (id, user_id);

alter table public.budget drop constraint if exists budget_category_same_owner;
alter table public.budget add constraint budget_category_same_owner
  foreign key (category_id, user_id) references public.category (id, user_id);

-- PostgREST resolves `category(...)` embeds from the foreign keys.
notify pgrst, 'reload schema';

-- Rollback:
--   alter table public.expense drop constraint expense_category_same_owner,
--     drop constraint expense_tag_same_owner, drop constraint expense_recurring_same_owner;
--   alter table public.recurring_expense drop constraint recurring_expense_category_same_owner;
--   alter table public.budget drop constraint budget_category_same_owner;
--   alter table public.expense
--     add foreign key (category_id) references public.category (id),
--     add foreign key (tag_id) references public.tag (id) on delete set null,
--     add foreign key (recurring_id) references public.recurring_expense (id) on delete set null;
--   alter table public.recurring_expense add foreign key (category_id) references public.category (id);
--   alter table public.budget add foreign key (category_id) references public.category (id);
--   alter table public.category drop constraint category_id_user_key;
--   alter table public.tag drop constraint tag_id_user_key;
--   alter table public.recurring_expense drop constraint recurring_expense_id_user_key;
