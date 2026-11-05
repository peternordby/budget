# Regnskap

A personal budget ledger with end-to-end encryption. Log what you spend, set a
budget per category and month, track savings balances, and see where the money
went — while the database only ever holds ciphertext of the amounts and
descriptions.

The interface is in Norwegian (bokmål) and amounts are in NOK. It installs as an
app on a phone's home screen, where it opens straight on the entry form.

Built with Next.js, React and Supabase.

## What it does

- **Transaksjoner** — add a purchase in a few taps on a phone, edit inline on a
  desktop, filter by date range, merkelapp, text, amount and category. Monthly
  fixed expenses show up as rows to book with one click. CSV import (with a
  preview, duplicate detection and no silent writes) and export.
- **Oversikt** — income against expenses for the selected month, year or all
  time, a budget gauge and a breakdown per category.
- **Budsjett** — a budget per category per month, with "copy from last month".
- **Innsikt** — the selected period day by day, from income down to what is
  left, and every purchase as a bubble; twelve-month trends per category; and
  **Reiser**, where each trip (a *merkelapp* with dates and places) gets a map,
  a timeline, cost per day and per stop, and its budget.
- **Sparing** — savings balances recorded as snapshots on any date, drawn as a
  stacked chart, independent of the transactions.
- **Profil** — name, email, password, six visual styles and an accent colour.

## Privacy and security

- **End-to-end encrypted.** Amounts, descriptions, merkelapper and places are
  encrypted in the browser with AES-GCM under a random data key. That key is
  wrapped under a key derived from your password (PBKDF2-SHA256, 600 000
  iterations) and under a recovery phrase shown once at setup. Supabase stores
  only the wrapped key and the ciphertext.
- **The password never reaches the server.** Supabase Auth receives a secret
  derived from it with a different salt, so the auth server holds nothing that
  opens the data key.
- **Lose both the password and the recovery phrase and the data is gone.** There
  is no escrow and no reset of the encryption — a password reset by email gets
  you into the account, and the recovery phrase gets you into the data.
- **Row-level security** on every table, including the foreign keys, so an
  account can neither read nor point at another account's rows.
- **A strict Content Security Policy** (a nonce per request) plus the usual
  security headers, because anything that ran in the page could read the
  unlocked key.
- The unlocked key stays in the browser for up to 7 days of non-use and is
  dropped on sign-out. Nothing in SQL can sum, sort or search an encrypted
  column, so all arithmetic happens in the browser.

The full design, and what it does not protect against, is in
[docs/frontend-architecture.md](docs/frontend-architecture.md#encryption).

## Getting started

Requirements: Node.js 20+, [pnpm](https://pnpm.io) and a
[Supabase](https://supabase.com) project.

```bash
pnpm install
cp .env.example .env.local   # then fill in the two values
```

Set up the database and Auth as described in
[supabase/README.md](supabase/README.md) — for a new project that is one SQL
file — and put the project URL and publishable key in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_...
```

Then:

```bash
pnpm dev     # http://localhost:3000
```

Sign up, confirm the email, and set up encryption on first login — write down
the recovery phrase.

## Scripts

| command | |
|---|---|
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm start` | serve the production build |
| `pnpm test` | unit and integration tests (vitest) |
| `pnpm check:browser <chrome\|chrome-phone\|safari\|ios> <path> [step ...]` | log in as a test user and screenshot a page in a real browser; see the top of `scripts/browser-check.mjs` |

## Project layout

```
app/              routes (Next.js App Router); the signed-in app is under app/(app)/
components/       React components and their CSS modules
lib/              pure logic: encryption, auth, analytics, CSV, periods, formatting
supabase/         schema.sql for a new project, migrations/ for an existing one
docs/             architecture and design-system notes
proxy.ts          the per-request Content Security Policy
```

## Stack

Next.js 16 and React 19 · Supabase (Postgres, Auth) · charts drawn in SVG with
d3 modules · maps from Natural Earth via `world-atlas` and place search through
OpenStreetMap's Nominatim · `motion` for animation · plain CSS with CSS
Modules · deployed on Vercel.

## Documentation

- [docs/frontend-architecture.md](docs/frontend-architecture.md) — data flow,
  auth, encryption, charts
- [docs/design-system.md](docs/design-system.md) — colours, typography, the six
  styles, motion
- [supabase/README.md](supabase/README.md) — database setup and rules
- [CLAUDE.md](CLAUDE.md) — the detailed conventions the codebase follows
