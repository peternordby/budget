# Frontend Architecture

## Tech Stack

- Next.js routing via `app/`
- React client components for authenticated pages
- Supabase client for authentication and data access
- One global stylesheet (`app/globals.css`) with design variables and utility classes

## Route Map

- `app/page.tsx` -> re-exports the visualize page as the root.
- `app/visualize/page.tsx` -> single-page dashboard: metrics, budgets, category charts, inline transaction editing, and activity list.
- `app/layout.tsx` -> global structure, font setup, and atmospheric background layer.

## Core Components

- `components/AuthGate.tsx`
  - Protects pages with a session check.
  - Renders login, loading state, or missing-config message.

- `components/AuthPanel.tsx`
  - Handles the sign-in form.
  - Renders Supabase auth errors inline in the form.

- `components/TopNav.tsx`
  - Branding and sign-out action.
  - Displays signed-in user identity with truncation for long values.

- `components/BudgetSummary.tsx`
  - Aggregated budget progress bar and percentage indicator.

## Data Flow Summary

`visualize/page.tsx`:

- Loads available periods from `expense.date`.
- Loads categories from `category`.
- Loads budgets from `budget` for the selected year.
- Loads expenses from `expense`, filtered by year/month.
- Supports inline creation of new transactions (spreadsheet-style input row).
- Supports inline editing of existing transactions (double-click to edit).
- Supports activity-table filtering by tag, category, and description.
- Supports per-column sorting in the activity table.
- Shows totals for the filtered activity set (including selected tag totals).
- Computes memoized totals for:
  - income
  - expenses
  - net
  - per-category totals
  - budget usage percentages

## Styling Rules

1. Add new visual variables in `:root` inside `app/globals.css`.
2. Reuse existing class families before adding one-off classes:
   - layout: `.shell`, `.grid`, `.section-gap`
   - cards: `.card`, `.stat`
   - forms: `.field`, `.form-grid`, `.form-actions`
   - buttons: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-small`
   - inline editing: `.cell-input`, `.new-row`, `.editing-row`
3. Prefer CSS classes over inline `style` attributes for maintainability.
4. Add new animations only when they improve orientation or feedback.

## Extension Guide

When adding a new page:

1. Wrap content in `.shell`.
2. Place `TopNav` first on authenticated pages.
3. Build sections with `.card` and `.section-gap`.
4. Use semantic color classes (`.text-income`, `.text-expense`) instead of raw color values.
5. Verify behavior at `1024px`, `860px`, `640px`, and `480px`.

When adding new status/message states:

1. Use `.helper` for neutral information.
2. Use `.status` for warning/error/high-importance feedback.
3. Keep text concise for compact card layouts.
