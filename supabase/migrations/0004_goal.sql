-- Savings goals: a name and a target amount. Progress is not stored — it is
-- the sum of savings-kind expenses whose `tag` matches the goal name, so the
-- existing tag column carries the link and `expense` needs no new column.

create table if not exists public.goal (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target bigint not null check (target > 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.goal enable row level security;

drop policy if exists "goal is per user" on public.goal;
create policy "goal is per user" on public.goal
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
