# Budget Ledger

Personal budget tracking app built with Next.js and Supabase.

## Commands

- `pnpm dev` - Start dev server
- `pnpm build` - Production build (use to verify changes compile)
- `pnpm start` - Start production server

## Stack

- **Framework**: Next.js 16 with React 19, TypeScript
- **Database**: Supabase (PostgreSQL with RLS)
- **Package manager**: pnpm
- **Styling**: `app/globals.css` (theme variables + shared primitives) plus co-located CSS Modules per component/route
- **Deployment**: Vercel

## Project Structure

```
app/
  layout.tsx                  Root layout, font (Schibsted Grotesk), theme init script, background
  page.tsx                    Redirects to /oversikt
  visualize/page.tsx          Redirects to /oversikt (kept for old links)
  globals.css                 Shared styles: theme variables, layout/nav/button/form primitives
  (app)/
    layout.tsx                AuthGate -> LedgerProvider -> TopNav + PeriodPicker -> route
    oversikt/page.tsx          Dashboard: budget gauge, category breakdown, MonthOverMonth, Anomalies
    oversikt/oversikt.module.css
    transaksjoner/page.tsx     Ledger: new-transaction row, RecurringPanel, activity table (search, CSV export)
    transaksjoner/transaksjoner.module.css
    innsikt/page.tsx           Trends: fixed/variable split, savings rate, category trends, subscriptions
    innsikt/innsikt.module.css
    sparing/page.tsx           Savings balances: stacked chart of all categories, add/import snapshots, history
    sparing/sparing.module.css
components/
  AuthGate.tsx        Session check wrapper (renders login or children)
  AuthPanel.tsx       Login form
  LedgerProvider.tsx  The one data fetch (expense/category/budget/recurring templates); useLedger, useLedgerHistory, useLedgerSelection, toLedgerEntries
  PeriodPicker.tsx    12-month chart + month/year picker; writes the URL period, widens the ledger window
  TopNav.tsx          Header with branding, route tabs, theme toggle and sign-out
  ThemeToggle.tsx     Light/dark switch (persists to localStorage "budget-theme")
  MonthOverMonth.tsx  Comparison stats and movers vs. the previous month (no chart; that moved to PeriodPicker)
  Anomalies.tsx       Anomaly list for the selected month (incl. unbooked fixed expenses)
  RecurringPanel.tsx  Fixed monthly expense templates and generation
  Sparkline.tsx       Minimal SVG line chart, used on /innsikt
  StackedAreaChart.tsx  Stacked area chart + reorderable legend/readout (used on /sparing)
  CategoryDrilldown.tsx  Category history panel, opened from /oversikt and /innsikt
  ItemAutocomplete.tsx, Toast.tsx
  icons.tsx           The shared icon set (chevrons, pencil, trash, plus, check, x)
  *.module.css        Co-located styles for the component above (see docs/design-system.md)
lib/
  supabaseClient.ts   Supabase client init
  format.ts           formatCurrency, formatDate, toNumber
  insights.ts         Pure analytics: monthly aggregation, month comparison, anomaly detection
  categories.ts       CategoryKind (income/fixed/variable/savings) and its predicates
  period.ts, usePeriod.ts  URL period state (?p=...&w=...)
  autocomplete.ts, recurring.ts
  trends.ts, subscriptions.ts  Category trends, fixed/variable split, savings rate, subscription detection (for /innsikt)
  savings.ts          Savings snapshots (for /sparing): holdings, carry-forward series, stacked bands, CSV import parsing
  categoryColor.ts    getCategoryHue (one category's colour) and categoryHues (a set spaced evenly apart)
  csv.ts              RFC 4180 CSV encoding (activity table export) and parsing (savings import), with delimiter sniffing
```

See `docs/frontend-architecture.md` for how these fit together.

## Database Tables

Five tables in Supabase: `category`, `expense`, `budget`, `recurring_expense`, `savings_snapshot`.

- `expense.price` is stored as integer (whole kroner, `bigint`)
- `expense.user_id` scopes data per user via RLS
- `budget` entries are per category/month/year
- Income is identified by `category.kind === "income"`, via the predicates in `lib/categories.ts`; the four kinds are `income`/`fixed`/`variable`/`savings`
- `savings_snapshot` holds one observed balance per (`category`, `date`) — `category` is free text, so a savings category exists exactly when it has a snapshot. It is **fully independent of `expense`**: nothing derives a balance from transactions, which is the point (a fund is worth what the market says, not the sum of deposits into it). Unique on (`user_id`, `category`, `date`), so re-entering a date or re-importing a CSV updates rather than duplicates. This replaced the old `goal` table, dropped in `0005_savings_snapshot.sql`
- `recurring_expense` holds fixed-expense templates (item, price, category, day of month); it carries `user_id` like the others and is fetched by `LedgerProvider` (exposed as `templates`) — `RecurringPanel.tsx` reads it from there and only writes to it directly (insert/update)

## Key Conventions

- UI language is Norwegian (bokmål)
- Currency: NOK, formatted as "1 234 kr" via `lib/format.ts`
- No backend API routes — all queries go directly from client to Supabase
- Category colors are generated deterministically from the category name hash, via `lib/categoryColor.ts`. Use `getCategoryHue` for one category in isolation (pills, dots, single bars); use `categoryHues` wherever several are drawn touching each other (the /sparing stacked chart), since a hash gives no guarantee that two names are far enough apart to tell apart
- Four routes under `app/(app)/` share one `AuthGate` -> `LedgerProvider` -> `TopNav`/`PeriodPicker` layout: `/oversikt` (dashboard, budgets), `/transaksjoner` (viewing, adding, editing, deleting transactions), `/innsikt` (spending trends, savings rate, subscriptions), and `/sparing` (savings balances). `/sparing` is listed in `ROUTES_WITHOUT_PERIOD` in `app/(app)/layout.tsx`, so it renders without `PeriodPicker` — its snapshots sit on arbitrary dates and are shown in full, so a month selection would have nothing to act on
- Migrations in `supabase/migrations/` are applied by hand. An already-applied migration is never edited; a later numbered one supersedes it
- Inline spreadsheet-style editing: double-click a row to edit, new-row input at top of table
- `useMemo` is used extensively for derived data (totals, filters, sorts)
- Light/dark theme via `data-theme` on `<html>`; all colors are CSS variables in `globals.css`
- One button vocabulary: `.btn` (+ `-primary`/`-ghost`/`-small`/`.is-on`) for text actions, `.icon-btn` (+ `-sm`/`-lg`/`-confirm`/`-dismiss`/`-danger`) for icon-only ones, `.collapse-toggle` + `.collapse-chevron` for a collapsible card header. Icons come from `components/icons.tsx` — don't declare a local `IconFoo()`
- Activity table / input form column order is a per-device preference in localStorage (`budget.column-order.v1`); drag headers on desktop, arrow buttons in the mobile form. The /sparing stack order works the same way (`budget.savings-order.v1`): drag a legend row, or use its arrows
- Insight sections (`MonthOverMonth`, `Anomalies`) consume a trailing 12-month expense window from `useLedgerHistory` (in `components/LedgerProvider.tsx`), not a separate fetch

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
