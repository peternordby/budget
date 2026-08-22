-- Phase 0: fixed monthly expenses.
-- A template describes a cost that repeats every month. Materializing it
-- creates an ordinary expense row whose recurring_id points back at the
-- template, which makes generation idempotent and lets later phases tell
-- committed costs from discretionary ones.

create table if not exists recurring_expense (
  id           bigint generated always as identity primary key,
  user_id      uuid   not null references auth.users(id) on delete cascade,
  item         text   not null,
  price        bigint not null,
  category_id  bigint not null references category(id),
  tag          text,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists recurring_expense_user_idx
  on recurring_expense (user_id);

alter table recurring_expense enable row level security;

create policy recurring_expense_owner on recurring_expense
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table expense
  add column if not exists recurring_id bigint
  references recurring_expense(id) on delete set null;

create index if not exists expense_recurring_idx
  on expense (recurring_id);
