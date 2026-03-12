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
  layout.tsx          Root layout, fonts, background
  page.tsx            Redirects to /visualize
  globals.css         All styles, design variables, responsive rules
  visualize/page.tsx  Main page: dashboard, budgets, inline editing, activity table
components/
  AuthGate.tsx        Session check wrapper (renders login or children)
  AuthPanel.tsx       Login form
  TopNav.tsx          Header with branding and sign-out
  BudgetSummary.tsx   Budget progress bar
lib/
  supabaseClient.ts   Supabase client init
  format.ts           formatCurrency, formatDate, toNumber
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

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
