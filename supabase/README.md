# Database

The app talks to Supabase straight from the browser: no API routes, no server
code. Everything here is applied by hand in the Supabase SQL editor.

## A new project

1. Create a Supabase project.
2. Run [`schema.sql`](schema.sql) once in the SQL editor. It is the whole schema
   as it stands after the last migration: six tables, row-level security on
   all of them, and the trigger that gives a new account its starter categories.
   **Do not run the migrations on top of it.**
3. Set up Auth as described [below](#auth-settings).
4. Copy the project URL and the publishable key into `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_...
   ```

   Only the publishable key ever goes in the app. The secret / `service_role`
   key bypasses row-level security and must never be shipped to a browser.

## An existing project

Apply the files in [`migrations/`](migrations) that it has not had yet, in
order. Each one says what it fixes, refuses to run when the data would make it
unsafe (with a message naming the problem), is safe to run twice, and ends with
its rollback.

- **Never edit a migration that has been applied.** A later, numbered file
  supersedes it.
- **Keep `schema.sql` in step:** every new migration changes it too, so a fresh
  project still gets the current schema in one go.
- The migrations alone cannot build a database from nothing. The first tables
  were made by hand before `0001`, and `0002` refuses to run unless
  `auth.users` holds exactly one user. That is what `schema.sql` is for.

## Auth settings

In the dashboard, under Authentication:

- **Email provider on, with "Confirm email".** Sign-up sends a link back to
  `/logg-inn`.
- **Redirect URLs:** add `http://localhost:3000/**` and the production origin.
  The app builds its links from `window.location.origin`.
- **Email templates:** password reset and invite both land on `/nytt-passord`.
  The default `{{ .ConfirmationURL }}` works; a template that links to
  `/nytt-passord?token_hash={{ .TokenHash }}&type=recovery` (or `type=invite`)
  works too and does not depend on the URL fragment.
- **Password rules belong in the app, not here.** The browser sends Supabase a
  secret derived from the password (`authSecret` in `lib/crypto.ts`), never the
  password itself. Supabase's minimum length, character rules and leaked-password
  check therefore only ever see that 48-character secret. The real rule
  (12 characters, `MIN_PASSWORD_LENGTH` in `lib/auth.ts`) is enforced in the
  forms.
- **"Require current password" on password change** is on in the live project,
  and the code sends `current_password` for it. Leave it on.
- Invitations are sent from the dashboard. `inviteUserByEmail` needs the secret
  key, so there is no invite button in the app.

## What the database can and cannot read

Amounts, descriptions, merkelapp names, budgets and places are encrypted in the
browser before they are stored. The database holds `gc:…` ciphertext in:

| table | encrypted columns |
|---|---|
| `expense` | `item`, `price` |
| `recurring_expense` | `item`, `price` |
| `budget` | `budget` |
| `savings_snapshot` | `amount` |
| `tag` | `name`, `budget`, `places` |

Dates, category names and kinds, savings category names and every key stay
readable, because queries filter and order by them. The consequence is
permanent: **no SQL may aggregate, sort or search an encrypted column** (no
`sum(price)`, no `order by price`, no `ilike` on `item`). The app refuses a
value without the `gc:` prefix, so do not write plain values into these columns
from the dashboard either.

The key material lives in `auth.users.raw_user_meta_data` (`enc_salt`,
`enc_dek`, `enc_iter`, `enc_dek_recovery`). It is wrapped under the password or
the recovery phrase, and the database cannot open it.
`docs/frontend-architecture.md` → Encryption has the full design.

## Row-level security

Every table has one owner policy, `for all using (user_id = auth.uid()) with
check (user_id = auth.uid())`, so a user reads and writes only their own rows.
Foreign keys carry `user_id` as well (`0013_same_owner_references.sql`), so a
row can only point at a category, merkelapp or template of the same owner.
Postgres checks foreign keys without RLS, so the policies alone could not stop
that.
