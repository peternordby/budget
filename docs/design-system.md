# Design System

## Visual Direction

The interface uses a warm "ledger journal" style:

- Light palette with sand and cream background tones.
- Burnt orange as the primary action color.
- Green for positive financial signals.
- Soft card surfaces with subtle blur and layered depth.

The goal is high readability for daily use without feeling like a flat default dashboard.

## Core Variables

Color and shape variables are defined in `app/globals.css` under `:root`.

Key variables:

- `--bg-base`, `--bg-alt`: page background colors.
- `--ink`, `--muted`: text hierarchy.
- `--accent`, `--accent-strong`, `--accent-soft`: action and highlight colors.
- `--income`, `--expense`: semantic finance colors.
- `--surface`, `--surface-popover`, `--border`: card and form structure.
- `--radius-card`, `--radius-soft`: shape and corner radius.
- `--shadow-soft`, `--shadow-tight`, `--shadow-inset`: depth system.

When adjusting theme behavior, update variables first before changing component rules.

## CSS Modules vs. `app/globals.css`

Styling is split between one global stylesheet and co-located CSS Modules. The boundary:

- **All `:root` and `html[data-theme="dark"]` custom properties stay in `app/globals.css`.** Every theme token (`--ink`, `--accent`, `--income`, `--surface`, `--radius-card`, the hue-generation variables, etc.) is defined only there. Custom properties are not scoped by CSS Modules, so a module is free to *reference* `var(--x)` — every module below does — without redeclaring it.
- **A module may still declare its own component-local custom property.** `transaksjoner.module.css` declares `--list-cols` (the activity table's grid-template-columns, rebuilt from the page's draggable column order) because it's local layout state, not a theme token — it just happens to use the `var()` mechanism to get computed values from inline `style` into module-scoped CSS.
- **Shared primitives that multiple routes/components use stay global**, in `app/globals.css`. In active use today:
  - Layout: `.shell`, `.section-gap`
  - Nav shell: `.nav`, `.brand-stack`, `.brand-kicker`, `.brand`, `.nav-links`, `.nav-meta`, `.user-chip`
  - Cards/sections: `.card`, `.section-title`
  - Forms: `.field`, `.field-label-row`, `.field-move`, `.form-grid`, `.form-actions`
  - Buttons: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-small`, `.btn.is-on`
  - Status/feedback: `.helper`, `.status`, `.empty`, `.badge`
  - `.collapse-toggle` — used by both `oversikt/page.tsx` (the category list) and `components/RecurringPanel.tsx` (the fixed-expenses panel on `/transaksjoner`), so unlike the rest of the category/budget widgets below it genuinely is shared and stays global.
  - `.activity-head` — used by `transaksjoner/page.tsx` directly, by `components/RecurringPanel.tsx` (`/transaksjoner`), and by `components/Anomalies.tsx` (`/oversikt`); the only member of the old "activity table chrome" group with more than one consumer, so it's the only one still global.
  - Semantic color: `.text-income`, `.text-expense`
  - Auth screen: `.auth-shell`, `.auth-card`
  - Icons: `.icon`
  - `.breakdown-dot` — a single small dot-swatch class, kept global specifically because `PeriodPicker` (its income/expense legend), `oversikt/page.tsx` (its category breakdown legend), and `innsikt/page.tsx` (its fixed/variable legend, added in the same phase as the route itself) all use it; splitting it into three component-local copies would just duplicate five lines of CSS three times over for no isolation benefit.
- **Component- or route-specific families live in a co-located `*.module.css`**, imported as `styles` and referenced as `styles["kebab-case-name"]` (not dot access, since the class names use hyphens):
  - `components/Anomalies.module.css`, `components/CategoryDrilldown.module.css`, `components/ItemAutocomplete.module.css`, `components/MonthOverMonth.module.css`, `components/PeriodPicker.module.css`, `components/RecurringPanel.module.css`, `components/Sparkline.module.css`, `components/Toast.module.css`, `components/TopNav.module.css`.
    - `CategoryDrilldown.module.css` styles the drill-down panel opened from both `/oversikt` and `/innsikt`: the dialog shell (`.panel`, `.header`, `.title`, `.close-button`, `.body`), the stats row (`.stats`/`.stat`), the month bar chart (`.bars`, `.bar-col`, `.bar-track`, `.bar-fill`, `.bar-budget-mark`, `.bar-label`), the budget-vs-actual table (`.budget-table`, `.budget-row`, `.over`/`.under`), and the transaction list (`.transactions`, `.transaction-row`, `.transaction-amount`). Its `.budget-row` is module-scoped and unrelated to the same-named, unused legacy class still sitting in `globals.css`.
    - `Sparkline.module.css` styles the one SVG chart element (`.sparkline`, `.sparkline-line`, `.sparkline-dot`), used wherever `<Sparkline>` is rendered (currently only `/innsikt`).
  - `app/(app)/oversikt/oversikt.module.css` — the budget gauge, expense-breakdown bar, and category-chart-row families, plus (single-consumer, relocated out of `globals.css`) `.insight-chip` (`.insight-good`/`.insight-warn`/`.insight-bad`), `.category-card.editing`, `.category-head`, `.collapse-chevron`, `.category-value`, `.icon-button`, and `.budget-popover` (`.budget-popover-row`/`.budget-popover-actions`).
  - `app/(app)/transaksjoner/transaksjoner.module.css` — the activity table's `.list`/`.list-header`/`.list-row` family (including `--list-cols`), plus (single-consumer, relocated out of `globals.css`) the rest of the old "activity table chrome" group (`.activity-controls`, `.activity-clear`, `.activity-total-row`, `.activity-total`, `.activity-total-meta`), inline spreadsheet editing (`.cell-input`, `.cell-input-number`, `.new-row`, `.editing-row`, `.row-actions`, `.save-button`, `.cancel-button`, `.edit-button`, `.delete-button`, `.mobile-new-row-card`, `.mobile-new-row-grid`), `.category-pill`, and the search/export controls added with the whole-window search toggle (`.activity-toggle`, `.activity-export`).
  - `app/(app)/innsikt/innsikt.module.css` — the fixed/variable split chart (`.split-chart`, `.split-col`, `.split-track`, `.split-seg-fixed`/`.split-seg-variable`, `.split-label`, `.split-legend`), the savings-rate layout (`.savings-layout`, `.savings-chart`, `.savings-stats`/`.savings-stat`), the category-trend tile grid (`.category-grid`, `.category-tile`), and the subscription table (`.subscription-table`, `.subscription-row`, `.subscription-action`).

  These families were previously (mis)labeled above as shared primitives even though each has exactly one consumer; leaving them global let `.list-row`'s cascade position in the emitted stylesheet silently outrank them once the route split moved `.list-row` into a module. They've since been moved to their single consumer's module, with source order inside the file preserving the original cascade (e.g. `.list-row` still precedes `.new-row`/`.editing-row` in `transaksjoner.module.css`).
- When a new component's styling doesn't clearly belong to one existing family above, default to a co-located module rather than adding to `globals.css` — the global file is for things multiple places already share, not a place to grow speculatively.

## Typography

- All text — body and headings alike — uses `--font-sans` (Schibsted Grotesk, set once on `body`); there is no separate serif/display face defined.
- Field labels use uppercase with letter spacing for fast form scanning.

Type hierarchy:

- Bare `<h1>` (used by `AuthPanel` and, with `.section-title`, by `AuthGate`'s missing-config message) inherits body styling — there's no dedicated hero/heading rule beyond `.section-title`.
- `.section-title`: section heading style.
- `.helper`: lower-emphasis supporting text.

## Layout and Spacing

Reusable primitives:

- `.shell`: page width and overall vertical rhythm.
- `.section-gap`: spacing between major sections.

Navigation:

- `.nav` is sticky on larger screens and static on smaller screens.
- `.user-chip` keeps user identity visible without dominating the header.

## Inline Editing

Spreadsheet-style input classes:

- `.cell-input`: compact input fields that sit within the table grid.
- `.new-row`: dashed-border input row for creating new transactions.
- `.editing-row`: highlighted row for inline editing of existing transactions.
- `.save-button`, `.cancel-button`: circular action buttons for row operations.
- `.row-actions`: container for edit/cancel button pairs.

## Motion

Motion is intentional and limited, split across the two style locations this document describes:

- `app/globals.css` defines `card-rise` (fade in + translate up), driving a page's top-level `.shell > section` entrance (staggered per section via `animation-delay`) and the `.budget-popover` open transition.
- `components/Toast.module.css` defines its own keyframe, `toast-in`, for the toast's entrance — module-scoped, since only `Toast.tsx` uses it.
- `components/CategoryDrilldown.module.css` likewise defines its own keyframe, `panel-in` (fade in + slide from the right), for the drill-down panel's entrance — module-scoped, since only `CategoryDrilldown.tsx` uses it.

These are gated in two ways, not by one shared rule: `card-rise` applies unconditionally and is neutralized by a blanket `@media (prefers-reduced-motion: reduce)` override in `globals.css` (forces `animation-duration`/`transition-duration` to `0.01ms`); `toast-in` and `panel-in` instead only ever apply inside `@media (prefers-reduced-motion: no-preference)` in their own module, so neither needs the override to begin with. Either pattern is fine for a new animation — pick whichever is more natural for where the keyframe lives.

## Responsive Rules

Primary breakpoints:

- `1024px`: tighter layout and container width.
- `860px`: stacked navigation, full-width controls, single-column list rows. Inline editing rows switch to a 2-column grid.
- `640px` and `480px`: tighter spacing and mobile-friendly form inputs.

Design goals:

- No horizontal scrolling.
- Primary actions remain easy to reach on mobile.

## Accessibility

- Input fields use visible labels (not placeholder-only).
- Focus states use both border and ring.
- Status text (`.status`, `.helper`) maintains good contrast on light surfaces.
- Reduced motion preferences are respected globally.
