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
- **Styling**: Single global CSS file (`app/globals.css`) with CSS variables
- **Deployment**: Vercel

## Project Structure

```
app/
  layout.tsx          Root layout, font (Schibsted Grotesk), theme init script, background
  page.tsx            Redirects to /visualize
  globals.css         All styles, light/dark theme variables, responsive rules
  visualize/page.tsx  Main page: dashboard, budgets, inline editing, activity table
components/
  AuthGate.tsx        Session check wrapper (renders login or children)
  AuthPanel.tsx       Login form
  TopNav.tsx          Header with branding, theme toggle and sign-out
  ThemeToggle.tsx     Light/dark switch (persists to localStorage "budget-theme")
  MonthOverMonth.tsx  12-month bar chart + comparison with previous month
  Anomalies.tsx       Anomaly list for the selected month
lib/
  supabaseClient.ts   Supabase client init
  format.ts           formatCurrency, formatDate, toNumber
  insights.ts         Pure analytics: monthly aggregation, month comparison, anomaly detection
```

## Database Tables

Three tables in Supabase: `category`, `expense`, `budget`.

- `expense.price` is stored as integer (whole kroner, `bigint`)
- `expense.user_id` scopes data per user via RLS
- `budget` entries are per category/month/year
- Income is identified by category name `"inntekter"`

## Key Conventions

- UI language is Norwegian (bokmål)
- Currency: NOK, formatted as "1 234 kr" via `lib/format.ts`
- No backend API routes — all queries go directly from client to Supabase
- Category colors are generated deterministically from category name hash
- The single page (`/visualize`) handles everything: viewing, adding, editing, deleting transactions and budgets
- Inline spreadsheet-style editing: double-click a row to edit, new-row input at top of table
- `useMemo` is used extensively for derived data (totals, filters, sorts)
- Light/dark theme via `data-theme` on `<html>`; all colors are CSS variables in `globals.css`
- Activity table / input form column order is a per-device preference in localStorage (`budget.column-order.v1`); drag headers on desktop, arrow buttons in the mobile form
- Insight sections (`MonthOverMonth`, `Anomalies`) consume a trailing 12-month expense window fetched separately in `visualize/page.tsx`

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
