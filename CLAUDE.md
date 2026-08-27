# Budget Ledger

Personal budget tracking app built with Next.js and Supabase.

## Commands

- `pnpm dev` - Start dev server
- `pnpm build` - Production build (use to verify changes compile)
- `pnpm start` - Start production server
- `pnpm test` - vitest (`lib/**/*.test.ts` and `test/**/*.test.ts`)

## Stack

- **Framework**: Next.js 16 with React 19, TypeScript
- **Database**: Supabase (PostgreSQL with RLS)
- **Package manager**: pnpm
- **Charts**: SVG, from `d3-scale`/`d3-shape`/`d3-array` (submodules, not the full `d3` bundle)
- **Avatars**: `@dicebear/core` + `@dicebear/styles` (the `croodles-neutral` definition only, ~24KB of JSON)
- **Animation**: `motion` (the successor to framer-motion)
- **Styling**: `app/globals.css` (theme variables + shared primitives) plus co-located CSS Modules per component/route; `components/charts.module.css` is the one module with several importers, since it styles the chart kit
- **Deployment**: Vercel

## Project Structure

```
app/
  layout.tsx                  Root layout, font (Schibsted Grotesk), theme init script, background
  page.tsx                    Redirects to /oversikt
  visualize/page.tsx          Redirects to /oversikt (kept for old links)
  logg-inn/page.tsx           Login (renders AuthPanel) — public, outside AuthGate
  registrer/page.tsx          Signup with email confirmation — public
  glemt-passord/page.tsx      Sends a password-reset link — public
  nytt-passord/page.tsx       Sets a new password; also the invite landing page — public
  globals.css                 Shared styles: theme variables, layout/nav/button/form primitives
  (app)/
    layout.tsx                AuthGate -> EncryptionGate -> LedgerProvider -> TopNav + PeriodPicker -> route
    oversikt/page.tsx          Dashboard: budget gauge and category breakdown (that is all of it now)
    oversikt/oversikt.module.css
    transaksjoner/page.tsx     Ledger: new-transaction row, RecurringPanel, activity table (search, CSV export)
    transaksjoner/transaksjoner.module.css
    budsjett/page.tsx          Budget editor: per-category name/kind/budget for the selected month (pencil opens one row), plus category add/delete
    budsjett/budsjett.module.css
    innsikt/page.tsx           Insights: MonthOverMonth, Anomalies, income-vs-expense net chart, fixed/variable/savings mix, category trends, subscriptions
    innsikt/innsikt.module.css
    sparing/page.tsx           Savings balances: stacked chart of all categories, add/import snapshots, history
    sparing/sparing.module.css
    profil/page.tsx            Account settings: name, email, password, sign out
    profil/profil.module.css
components/
  Avatar.tsx          DiceBear "croodles-neutral" avatar, seeded on the name (nav chip and /profil)
  AuthGate.tsx        Session check wrapper (renders children, or redirects to /logg-inn)
  AuthPanel.tsx       Login form (the body of /logg-inn); unlocks the data key while the password is in hand
  EncryptionGate.tsx  The data key: set up / unlock / recover, above LedgerProvider
  LedgerProvider.tsx  The one data fetch (expense/category/budget/recurring templates); useLedger, useLedgerHistory, useLedgerSelection, toLedgerEntries
  PeriodPicker.tsx    Month/year picker over a 12-month chart (8 back, current, 3 ahead); writes the URL period, widens the ledger window
  TopNav.tsx          Header with branding, route tabs, theme toggle and sign-out
  ThemeToggle.tsx     Light/dark switch (persists to localStorage "budget-theme")
  MonthOverMonth.tsx  Comparison stats and movers vs. the previous month (no chart; that moved to PeriodPicker); on /innsikt
  Anomalies.tsx       Anomaly list for the selected month (incl. unbooked fixed expenses); on /innsikt
  RecurringPanel.tsx  Fixed monthly expense templates and generation
  charts.tsx          The chart kit: useMeasure, ChartTooltip, GridLines, BulletBar, GaugeArc, ShareBar, Collapse, bandLayout
  MonthColumns.tsx    The monthly column chart: grouped (PeriodPicker), diverging (/innsikt net), single + budget marker (CategoryDrilldown)
  Sparkline.tsx       SVG line chart with gradient fill and optional hover readout, used on /innsikt
  StackedAreaChart.tsx  Stacked area chart + reorderable legend/readout (used on /sparing)
  CategoryDrilldown.tsx  Category history panel, opened from an /innsikt category tile
  ItemAutocomplete.tsx, Toast.tsx
  icons.tsx           The shared icon set (chevrons, pencil, trash, plus, check, x)
  *.module.css        Co-located styles for the component above (see docs/design-system.md)
lib/
  supabaseClient.ts   Supabase client init
  format.ts           formatCurrency, formatDate, toNumber, MONTH_NAMES/monthName/monthLabel
  insights.ts         Pure analytics: monthly aggregation, month comparison, anomaly detection
  categories.ts       CategoryKind (income/fixed/variable/savings) and its predicates
  period.ts, usePeriod.ts  URL period state (?p=...&w=...); period.ts also owns periodLabel and the picker's window shape
  autocomplete.ts, recurring.ts
  trends.ts, subscriptions.ts  Category trends, the fixed/variable/savings mix of an average month, subscription detection (for /innsikt)
  dismissals.ts       localStorage-backed "stop suggesting this": subscription suspects and per-month missing-fixed warnings
  savings.ts          Savings snapshots (for /sparing): holdings, carry-forward series, stacked bands, CSV import parsing
  categoryColor.ts    getCategoryHue (one category's colour) and categoryHues (a set spaced evenly apart)
  chart.ts            Chart arithmetic: axisTicks, shortAmount, labelledDates, divergingTicks, shareWidths
  motion.ts           Motion tokens: one easing curve, three durations, stagger()
  profile.ts          displayName/fullName over the session user; no profile table
  crypto.ts           Client-side AES-GCM field encryption, the wrapped data key, the recovery phrase
  reencrypt.ts        The one-time pass (button on /profil) that encrypts pre-encryption rows
  csv.ts              RFC 4180 CSV encoding (activity table export) and parsing (savings import), with delimiter sniffing
```

See `docs/frontend-architecture.md` for how these fit together.

## Database Tables

Five tables in Supabase: `category`, `expense`, `budget`, `recurring_expense`, `savings_snapshot`.

- `expense.price` is whole kroner, stored as **encrypted decimal text**: `0009_encrypted_fields.sql` widened `expense.price`, `recurring_expense.price`, `budget.budget` and `savings_snapshot.amount` from `bigint` to `text` (and dropped `savings_snapshot`'s `amount >= 0` check, which cannot be expressed about a value the database cannot read — the client enforces it now). `expense.item`/`tag` and `recurring_expense.item`/`tag` are encrypted too
- `expense.user_id` scopes data per user via RLS
- `budget` entries are per category/month/year, unique on (`user_id`, `category_id`, `year`, `month`) since `0006_budget_owner.sql`, so writes are a single upsert. That migration also replaced three `using (true)` policies (every authenticated user could read and overwrite every other user's budgets) with the owner-scoped `budget_owner`
- Income is identified by `category.kind === "income"`, via the predicates in `lib/categories.ts`; the four kinds are `income`/`fixed`/`variable`/`savings`
- `savings_snapshot` holds one observed balance per (`category`, `date`) — `category` is free text, so a savings category exists exactly when it has a snapshot. It is **fully independent of `expense`**: nothing derives a balance from transactions, which is the point (a fund is worth what the market says, not the sum of deposits into it). Unique on (`user_id`, `category`, `date`), so re-entering a date or re-importing a CSV updates rather than duplicates. This replaced the old `goal` table, dropped in `0005_savings_snapshot.sql`
- `recurring_expense` holds fixed-expense templates (item, price, category, day of month); it carries `user_id` like the others and is fetched by `LedgerProvider` (exposed as `templates`) — `RecurringPanel.tsx` reads it from there and only writes to it directly (insert/update)

## Key Conventions

- **Amounts and descriptions are end-to-end encrypted in the browser** (`lib/crypto.ts`), under a key the server never sees. Three rules follow and none of them are negotiable without undoing the migration: **nothing may aggregate or filter these columns in SQL** (no `sum(price)`, no `order by price`, no `ilike` on `item`) — every query orders by date/id/category and filters by date/user_id, and all arithmetic happens client-side on decrypted rows; **the ledger is decrypted once, in `LedgerProvider`**, so every consumer downstream (`useMemo`s, search, CSV export, `lib/insights.ts`) sees plain numbers and strings and never touches `lib/crypto.ts` — only the routes with their own one-off reads decrypt themselves (`/budsjett`'s drafts, `/sparing`'s snapshots, `/innsikt`'s subscription lookup); and **every write calls `encField` at the call site** on its way to Supabase. The key material (`enc_salt`, `enc_dek`, `enc_dek_recovery`) lives in `auth.users.user_metadata`, the unlocked key in `localStorage` (`budget.dek.v2`) stamped with its user id and a 7-day expiry that slides on every resume, and `EncryptionGate` handles setup, unlock and recovery-phrase recovery. `decField` passes anything without the `gc:` prefix through untouched, so pre-encryption rows keep working until the pass on `/profil` reaches them. See `docs/frontend-architecture.md` -> Encryption
- UI language is Norwegian (bokmål)
- Currency: NOK, formatted as "1 234 kr" via `lib/format.ts`
- No backend API routes — all queries go directly from client to Supabase
- **Category colors come from eight fixed, validated slots** (`--cat-1`..`--cat-8` in `globals.css`), assigned deterministically from the category name hash via `lib/categoryColor.ts`. Use `getCategorySlot` for one category in isolation (pills, dots, single bars) and `categorySlots` wherever several are drawn touching each other (the /sparing stacked chart, where the set-aware version guarantees distinct slots). Then `categoryColor(slot)` for a mark, `categoryTint`/`categoryInk` for the pill. **The slot order is the colorblind-safety mechanism, not a preference** — adjacent slots are what end up touching, and this order is the one that clears the gates; re-ordering or re-picking a step means re-validating the set. This replaced hue-from-hash painted as `hsl(hue, --seg-s, --seg-l)`: HSL lightness is not perceptual, so at a fixed 56% the yellows and cyans measured 1.9:1 against the card (invisible) while the blues sat at 3.5:1, and hues 45° apart came out ΔE 0.2 under deuteranopia — the same color
- Six routes under `app/(app)/` share one `AuthGate` -> `LedgerProvider` -> `TopNav`/`PeriodPicker` layout: `/oversikt` (dashboard: budget gauge and category breakdown), `/transaksjoner` (viewing, adding, editing, deleting transactions), `/budsjett` (setting budgets and kinds per category, and category add/delete), `/innsikt` (month-over-month, anomalies, spending trends, the fixed/variable mix, subscriptions), `/sparing` (savings balances), and `/profil` (account settings). `/profil` is deliberately **not** a tab — it is reached from the user chip in the header, since a sixth tab does not fit the phone's bottom bar and a profile is not a view of the ledger. Signing out lives there, not in the nav. `TopNav`'s bottom tab bar shows a `short` label per route on phones — five full names do not fit a 375px screen. `/sparing` and `/profil` are listed in `ROUTES_WITHOUT_PERIOD` in `app/(app)/layout.tsx`, so they render without `PeriodPicker` — savings snapshots sit on arbitrary dates and are shown in full, and account settings are not ledger data at all, so a month selection would have nothing to act on in either
- A new account is seeded with default categories by a trigger on `auth.users` (`0007_seed_default_categories.sql`); without it a signup lands in an app where no form can be submitted, since every entry needs a `category_id`
- The user's name lives in `auth.users.user_metadata.full_name`, not in a table: the session already carries it and `auth.updateUser({ data })` already writes it, so a `profile` table would add a migration, a policy and a fetch to store one string. The avatar follows the same principle: a DiceBear `croodles-neutral` drawing **seeded on the name** (`@dicebear/core` + `@dicebear/styles`), so it exists the moment the account has a name — no storage bucket, no upload, nothing that can 404. It renders as an `<img>` off `toDataUri()`, not as inline SVG: inline would mean `dangerouslySetInnerHTML`, and the seed is user-supplied. The `initials`/`avatarSlot` helpers that drew the old monogram are gone with it
- Changing a password on `/profil` re-authenticates first (`signInWithPassword` with the entered current password) because Supabase's `updateUser` does not check the old one; without it an unlocked laptop is enough to lock the owner out
- Changing an email sends a confirmation to **both** the old and the new address (Supabase's default "Secure email change") and applies only when both are opened; `user.new_email` carries the pending address in the meantime
- Auth is client-only (`@supabase/supabase-js`, implicit flow, no `@supabase/ssr`, no middleware, no route handlers). The four public auth routes sit outside the `(app)` group so `AuthGate` never wraps them. `/nytt-passord` accepts both link shapes — `?token_hash=&type=` via `verifyOtp`, or a session already parsed from the URL fragment by `detectSessionInUrl`
- Migrations in `supabase/migrations/` are applied by hand. An already-applied migration is never edited; a later numbered one supersedes it
- **A tooltip must never overflow the chart it belongs to.** Two rules in `globals.css` box it in: `.card > *` gives every direct child `position: relative; z-index: 1`, so a *later* sibling in the same card (a legend, a stat row) paints over anything overflowing an earlier one — equal z-index, DOM order wins; and `.card` carries `backdrop-filter`, which always makes an element a stacking context, so escaping the card entirely just puts it under the next section. `ChartTooltip` derives its side from the anchor's `y`; a chart whose tooltip would overflow passes `flip` explicitly to point it inward (`ShareBar` does — its bar is 24px from the top of the card, so the derived "below" put the tooltip under the legend)
- **Every chart is SVG drawn in measured pixels**, from `d3-scale`/`d3-shape` on top of `components/charts.tsx`. Three rules: a chart **measures its own box** (`useMeasure`) rather than stretching a fixed viewBox with `preserveAspectRatio="none"` — that stretch is what forced every old label to be HTML positioned in percentages and every stroke to carry `vector-effect`; **the scale arithmetic lives in `lib/chart.ts`**, not in the component, so it is unit-tested (`lib/chart.test.ts`, `lib/savings.test.ts`) instead of eyeballed; and **there is exactly one tooltip**, `ChartTooltip`, so a hover readout looks and behaves the same on every route. Hit areas are real HTML `<button>`/`<div role="img">` elements tiled over the SVG, not handlers on the shapes, which is what gives keyboard focus, `aria-pressed` and an accessible name carrying the same figures the tooltip shows
- `MonthColumns`' bars are deliberately **not** animated: every month key changes when the window shifts, so the entrance replayed in full on every press of the picker's arrows. Its hover band and tooltip still animate — pointer feedback, not data arriving
- **Animation is `motion`**, with `<MotionConfig reducedMotion="user">` in `app/(app)/layout.tsx` as the single gate on the OS setting — no component checks the media query itself. Durations and the easing curve come from `lib/motion.ts` (`T_FAST` 140ms for pointer feedback, `T_BASE` 220ms for a state change the user asked for, `T_DRAW` 450ms for data arriving); don't inline a duration. The CSS keyframes that remain (`card-rise` in `globals.css`) are still covered by the blanket `prefers-reduced-motion: reduce` override there. `anime.js` is not installed and should not be: it overlaps `motion` completely
- Inline spreadsheet-style editing: double-click a row to edit, new-row input at top of table
- `useMemo` is used extensively for derived data (totals, filters, sorts)
- Light/dark theme via `data-theme` on `<html>`; all colors are CSS variables in `globals.css`
- One button vocabulary: `.btn` (+ `-primary`/`-ghost`/`-small`/`.is-on`) for text actions, `.icon-btn` (+ `-sm`/`-lg`/`-confirm`/`-dismiss`/`-danger`) for icon-only ones, `.collapse-toggle` + `.collapse-chevron` for a collapsible card header. Icons come from `components/icons.tsx` — don't declare a local `IconFoo()`
- Dismissed suggestions are a per-device preference in localStorage (`budget.dismissals.v1`, `lib/dismissals.ts`): subscription suspects on `/innsikt`, and per-month "denne faste utgiften gjelder ikke denne måneden" on `RecurringPanel` (which `Anomalies` honours too, so the two never disagree)
- Activity table / input form column order is a per-device preference in localStorage (`budget.column-order.v1`); drag headers on desktop, arrow buttons in the mobile form. The /sparing stack order works the same way (`budget.savings-order.v1`): drag a legend row, or use its arrows
- **The period picker's window is 8 months back, the current month, and 3 ahead** — not a trailing 12: a budget is set before its month starts, which is also why the year buttons offer next year. `WINDOW_BEFORE`/`WINDOW_AFTER`/`chartWindow`/`yearAnchor` in `lib/period.ts` own that shape, because `selectYear` needs it too (anchoring a year selection at December would draw April–March). Its arrows move the **selection** as well as the window (`shiftPeriod`), `I dag` selects the current month *and* scrolls back to it (`goToToday`, which is how you get out of a whole-year selection), and multi-select is Ctrl/⌘/shift-click only — the `Velg flere` mode toggle is gone
- Insight sections (`MonthOverMonth`, `Anomalies`) live on **`/innsikt`**, not `/oversikt`: both compare the selected month with its recent past, which is an insight rather than an overview. They consume a trailing 12-month expense window from `useLedgerHistory` (in `components/LedgerProvider.tsx`) — deliberately not `/innsikt`'s own 24-month `useAnalysisWindow` — and not a separate fetch
- **`/oversikt` is the gauge and the breakdown, and nothing else.** The collapsible category list it used to carry was a second, read-only copy of `/budsjett`'s rows; the drill-down was only reachable from those rows, so it left with them. Both of the page's sections are conditional, so it also carries an explicit empty state — without one, a month with no budget and no spending renders blank, which reads as a failure
- **`/budsjett` rows are read-only until you press the pencil**, which turns that one row's **name, kind and budget** into controls with a tick/cross beside them. The tick writes name and kind together (one `category` update, since both live on that table) and the budget separately, with a single refetch; the cross discards all three, and a blanked name is refused rather than silently ignored. The toolbar's `Lagre N endringer` remains for `Kopier N fra <måned>`, which **fills only the empty budget cells** and never overwrites a value already set (typed or stored) — the button states the count and disappears when there is nothing to copy. A read-only cell shows its *draft* value, marked with `.budget-pending`, so a copied figure is visible before it is saved
- The `/budsjett` columns are `Budsjett` and **`Faktisk`**, and the variance column is oriented so **positive is always the good direction**: `budsjett − faktisk` for spending (what is left), `faktisk − budsjett` for income, because earning more than planned is a surplus, not an overrun

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
