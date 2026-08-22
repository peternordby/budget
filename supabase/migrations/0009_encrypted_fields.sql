-- Make room for ciphertext in the money and description columns.
--
-- From here the amounts and the item/tag text are encrypted in the browser
-- (lib/crypto.ts) under a key derived from the user's password, so the database
-- and whoever administers it hold only ciphertext. That is affordable precisely
-- because nothing in SQL ever did arithmetic on these columns: every query in
-- the app orders by date/id/category and filters by date/user_id, and all the
-- aggregation happens client-side.
--
-- The trade is permanent and worth stating in the schema: no `sum(price)`, no
-- server-side reports, no sanity-checking a user's figures in the dashboard,
-- ever. A future feature that needs the database to understand the money has to
-- undo this migration, not work around it.
--
-- `bigint` -> `text` keeps the existing values as bare digit strings, and
-- lib/crypto.ts `decField` passes anything without the `gc:` marker through
-- untouched. So the app keeps working the moment this lands, before a single
-- row has been re-encrypted, and a half-finished re-encrypt pass (the button on
-- /profil) is a consistent state rather than a broken one.

alter table expense
  alter column price type text using price::text;

alter table recurring_expense
  alter column price type text using price::text;

alter table budget
  alter column budget type text using budget::text;

-- The check went with the column type: ">= 0" cannot be expressed about a value
-- the database cannot read. The client enforces it (app/(app)/sparing/page.tsx
-- refuses a negative draft), which is now the only place that can.
alter table savings_snapshot
  drop constraint if exists savings_snapshot_amount_check;

alter table savings_snapshot
  alter column amount type text using amount::text;

-- `item` and `tag` are already text, and `savings_snapshot.category` stays in
-- the clear deliberately: it is part of `unique (user_id, category, date)`, and
-- AES-GCM ciphertext differs on every write, so encrypting it would turn every
-- re-imported CSV row into a duplicate instead of an update.
