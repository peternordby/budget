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
  - Layout: `.shell`, `.section-gap`, `.toolbar` (`.toolbar-check`, `.toolbar-actions`)
  - Nav shell: `.nav`, `.brand-stack`, `.brand-kicker`, `.brand`, `.nav-links`, `.nav-meta`, `.user-chip`
  - Cards/sections: `.card`, `.section-title`, `.card-head` (`.card-head-meta`)
  - Forms: `.field`, `.field-label-row`, `.field-move`, `.form-grid`, `.form-actions`
  - Buttons: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-small`, `.btn.is-on`
  - Icon buttons: `.icon-btn` (`.icon-btn-sm`, `.icon-btn-lg`, `.icon-btn-confirm`, `.icon-btn-dismiss`, `.icon-btn-danger`)
  - Expandables: `.collapse-toggle`, `.collapse-chevron` (`.collapsed`)
  - Status/feedback: `.helper`, `.status`, `.empty`, `.badge`, `.badge-warn`
  - Stats: `.stat-row`, `.stat` (`.stat-small`), `.stat-label`, `.stat-value` (`.is-good`/`.is-bad`), `.stat-delta` (`.good`/`.bad`/`.neutral`)
  - Numerics: `.num`
  - `.collapse-toggle` + `.collapse-chevron` — the two collapsible card headers, `oversikt/page.tsx` (the category list) and `components/RecurringPanel.tsx` (the fixed-expenses panel on `/transaksjoner`). `.collapse-chevron` used to live in `oversikt.module.css`, which is exactly why RecurringPanel had **no chevron at all** — module scoping put the class out of its reach, so the two collapsibles looked like different kinds of control. Both now carry the chevron, `aria-expanded` and `aria-controls`.
  - **`.icon-btn`** — the square icon control. It replaced seven near-identical private definitions that had drifted apart: `.theme-toggle`, `.field-move button`, `oversikt`'s `.icon-button`, `transaksjoner`'s `.delete-button`/`.save-button`/`.cancel-button`, `sparing`'s `.delete-button`, and `CategoryDrilldown`'s `.close-button` (which was a bare `×` glyph rather than a button at all). Between them they used four sizes (22/26/28/34px) and three disabled opacities (0.3/0.35/0.4). Now: three deliberate sizes — `.icon-btn` 28px for table rows, `.icon-btn-sm` 22px for a form label row, `.icon-btn-lg` 34px for the nav — and three tones. `.icon-btn-confirm`/`.icon-btn-dismiss` are the tinted green/red pair for inline editing, where the tick and cross *are* the affordance. `.icon-btn-danger` is neutral until hover, which is what a delete button in a long table needs: forty permanently red buttons read as forty warnings, not one destructive action. Both delete buttons in the app use it, so they finally match.
  - `.card-head` — the card header row: a `.section-title` on the left, meta (the period, a count, the sort order, a `.badge`) on the right. Formerly `.activity-head`, named for the one route that happened to use it first; it is now what every card opens with — `transaksjoner/page.tsx`, `components/RecurringPanel.tsx`, `components/Anomalies.tsx`, both `/oversikt` cards that have meta, all three `/innsikt` sections, and all four `/sparing` sections. It clears `.section-title`'s own bottom margin and supplies the 14px itself, so the spacing is identical whether a heading is wrapped in one or stands alone. `.card-head-meta` groups more than one thing on the meta side (RecurringPanel's active count plus its "N mangler" badge).
  - Semantic color: `.text-income`, `.text-expense`
  - **Stats** — `.stat-row` wraps a set of `.stat`s (label above value, optional `.stat-delta` chip or `.helper` line below). This replaced five independent copies of the same markup: `oversikt.module.css`'s `.gauge-stat*`, `MonthOverMonth.module.css`'s `.compare-stat*`/`.compare-chip*`, `innsikt.module.css`'s `.savings-stat`, `CategoryDrilldown.module.css`'s `.stats`/`.stat`, and `/transaksjoner`'s `.activity-total`. All five are gone. Use `.stat-small` where the figure sits inside a tile or panel rather than being a page-level number, `.is-good`/`.is-bad` on `.stat-value` to colour the figure itself, and `.stat-delta` for the change chip.
  - **`.num`** — `tabular-nums` plus `text-align: right`, for any cell holding money or a count. Amounts used to be left-aligned in both the activity table and the subscription table, which made a column of kroner impossible to compare by eye. A grid whose numeric column uses `.num` must right-align its header too (see `.list-sort.align-end` below).
  - **`.toolbar`** — a filter bar: `.field`s flow along one baseline (`flex: 1 1 170px`), a `.toolbar-check` holds an inline checkbox at input height, and `.toolbar-actions` pins the buttons to the far end. It replaced `.activity-controls`, an `auto-fit` grid that gave inputs, a checkbox and two buttons equal-width cells, so nothing shared a baseline and the export button wrapped onto a row of its own.
  - Auth screen: `.auth-shell`, `.auth-card`
  - Icons: `.icon`
  - `.breakdown-dot` — a single small dot-swatch class, kept global specifically because `PeriodPicker` (its income/expense legend), `oversikt/page.tsx` (its category breakdown legend), and `innsikt/page.tsx` (its fixed/variable legend, added in the same phase as the route itself) all use it; splitting it into three component-local copies would just duplicate five lines of CSS three times over for no isolation benefit.
- **Component- or route-specific families live in a co-located `*.module.css`**, imported as `styles` and referenced as `styles["kebab-case-name"]` (not dot access, since the class names use hyphens):
  - `components/Anomalies.module.css`, `components/CategoryDrilldown.module.css`, `components/ItemAutocomplete.module.css`, `components/MonthOverMonth.module.css`, `components/PeriodPicker.module.css`, `components/RecurringPanel.module.css`, `components/Sparkline.module.css`, `components/Toast.module.css`, `components/TopNav.module.css`.
    - `CategoryDrilldown.module.css` styles the drill-down panel opened from both `/oversikt` and `/innsikt`: the dialog shell (`.panel`, `.header`, `.title`, `.close-button`, `.body`), the month bar chart (`.bars`, `.bar-col`, `.bar-track`, `.bar-fill`, `.bar-budget-mark`, `.bar-label`), the budget-vs-actual table (`.budget-table`, `.budget-row`, `.over`/`.under`), and the transaction list (`.transactions`, `.transaction-row`, `.transaction-item`, `.transaction-amount`); its mean/median pair uses the global `.stat-row`/`.stat stat-small`. Every level from `.body` down carries `min-width: 0`: grid items default to `min-width: auto`, so a row of nowrap columns sized the track to its own min-content and the 440px panel scrolled sideways instead — the budget-vs-actual table rendered as a list of month labels with every figure parked off-screen. The row is now `month | .budget-figures` (actual / budget / difference, right-aligned and free to wrap), which fits the panel at four figures where four rigid columns needed 667px. Its `.budget-row` is module-scoped and unrelated to the same-named, unused legacy class still sitting in `globals.css`.
    - `Sparkline.module.css` styles the one SVG chart element (`.sparkline`, `.sparkline-line`, `.sparkline-dot`), used wherever `<Sparkline>` is rendered (currently only `/innsikt`).
    - `StackedAreaChart.module.css` styles the `/sparing` chart and its legend: the plot box and axis gutters (`.plot`, `.chart`, `.y-label`, `.x-axis`, `.x-label`), the bands (`.band`, `.band-edge`, `.point-mark`, `.total-line`), the hover guide and its tooltip (`.guide`, `.guide-dot`, `.hit`, `.tooltip` with its `data-side`/`data-flip` placement variants, `.tooltip-date`, `.tooltip-total`, `.tooltip-change`), and the legend/readout rows (`.legend`, `.legend-head`, `.legend-row` with `.is-dragging`/`.is-drop-target`, `.swatch`, `.legend-name`, `.legend-name-text`, `.stale`, `.legend-move`). Two rules are load-bearing rather than cosmetic: `.plot`'s left margin *is* the value-axis gutter, which is what lets an HTML label positioned by percentage line up with an SVG coordinate (the viewBox maps 1:1 onto the plot box, so no text has to live inside the stretched viewBox and get squashed); and `.legend-name-text` truncates while `.stale` is `flex: none`, so a long category name gives way rather than clipping the badge that exists to report the problem. Below 480px only the first and last date labels are kept — the rest cannot fit without overlapping.
  - `app/(app)/oversikt/oversikt.module.css` — the budget gauge (`.gauge-main-total` dims the "/ budget" half of the lead figure), expense-breakdown bar, and category-chart-row families, plus (single-consumer, relocated out of `globals.css`) `.insight-chip` (`.insight-good`/`.insight-warn`/`.insight-bad`), `.category-card.editing`, `.collapse-chevron`, `.category-value`, `.icon-button`, and `.budget-popover` (`.budget-popover-row`/`.budget-popover-actions`). `.category-head` is gone — it was a private copy of `.card-head`.
    - A category row is one row: name (with its dot) | amounts, right-aligned | `.cat-pct-slot` | the pencil, as four real grid columns, with a 6px track underneath. It used to put the amounts on a second line via `grid-column: 1 / -1` and float the badge and pencil over the top-right corner absolutely, over a 16px full-bleed bar — so each entry read as three disconnected lines with no row boundary. `.cat-pct-slot` is a fixed 46px so the badge column still lines up for categories that have no budget. Below 720px the name takes its own line (four columns starve it into a single truncated letter on a phone); the figures inside `.category-chart-values` are individually `nowrap` so a wrap never lands inside an amount.
  - `app/(app)/transaksjoner/transaksjoner.module.css` — the activity table's `.list`/`.list-header`/`.list-row` family (including `--list-cols`) and `.list-sort.align-end` (the amount column is `.num`, so its draggable header button has to right-align with it; keyed off the column identity, since the order is user-controlled), plus `.activity-total-row` (now just the rule below the `.stat-row` of totals — `.activity-controls`, `.activity-clear`, `.activity-export`, `.activity-toggle`, `.activity-total` and `.activity-total-meta` are gone, replaced by `.toolbar` and `.stat*`), inline spreadsheet editing (`.cell-input`, `.cell-input-number`, `.new-row`, `.editing-row`, `.row-actions`, `.save-button`, `.cancel-button`, `.edit-button`, `.delete-button`, `.mobile-new-row-card`, `.mobile-new-row-grid`), and `.category-pill`.
  - `app/(app)/sparing/sparing.module.css` — the order-controls row between chart and legend (`.legend-head-row`), the CSV import block (`.import`, `.import-head`, `.import-file`, `.import-preview`, `.import-errors`), and the snapshot history table (`.history`, `.history-header`, `.history-row`, `.delete-button`). The chart itself lives in `components/StackedAreaChart.module.css`; the earlier per-category tiles and total-bar-chart families are gone, replaced by that one chart.
  - `app/(app)/innsikt/innsikt.module.css` — the fixed/variable split chart (`.split-chart`, `.split-col`, `.split-track`, `.split-seg-fixed`/`.split-seg-variable`, `.split-label`, `.split-legend`), the savings-rate layout (`.savings-layout`, `.savings-chart`, `.savings-stats`), the category-trend tile grid (`.category-grid`, `.category-tile`, `.tile-stat`), and the subscription table (`.subscription-table`, `.subscription-row`, `.subscription-action`). `.savings-stat` is gone; both savings figures are `.stat`s.
    - `.split-col` is `flex: 1 1 0` with a `min-width`, and `.split-track` is `width: 100%` capped at 30px, so the chart spans its card and only falls back to horizontal scrolling once the columns would get too thin to label. It previously drew fixed 22px columns and stopped, leaving half of a desktop-width card empty.
    - `.tile-stat` puts each of a tile's three figures on one line as label-left / amount-right (`.num`), so the numbers form a column comparable from tile to tile. They were three bare sentences ("Totalt 226 021 kr") with nothing separating label from value.

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

## Icons

All icons live in `components/icons.tsx` and inherit the global `.icon` rule (1em square, `currentColor` stroke, no fill), so size and colour come from the container — `.icon-btn` sizes them per button size. They were previously local `function IconX()` declarations copy-pasted per route: three copies of the chevron, and two *different* trash cans for the same delete action on `/transaksjoner` and `/sparing`. `ThemeToggle` keeps its own sun/moon, which have one consumer and belong to that control.

## Inline Editing

Spreadsheet-style input classes:

- `.cell-input`: compact input fields that sit within the table grid.
- `.new-row`: dashed-border input row for creating new transactions.
- `.editing-row`: highlighted row for inline editing of existing transactions.
- Row actions use the global `.icon-btn` family — `.icon-btn-confirm`/`.icon-btn-dismiss` for save/cancel, `.icon-btn-danger` for delete. `transaksjoner.module.css` keeps only `.row-delete`, which positions the delete button in the row and says nothing about how it looks.
- `.row-actions`: container for edit/cancel button pairs.

## Category colour

Category colours are hues derived from the category name in `lib/categoryColor.ts`, combined with per-surface saturation/lightness tokens (`--seg-*`, `--dot-*`, `--bar-*`, `--pill-*`) so each surface tunes its own contrast per theme while the hue stays shared.

There are two functions, and picking the wrong one is a real bug rather than a preference:

- `getCategoryHue(name)` — one category in isolation. Correct for a pill in a table, a dot in a list, a single bar.
- `categoryHues(names)` — a whole set, spaced evenly around the wheel. Required wherever several categories are drawn *touching each other*. A hash offers no minimum separation, and in practice "Fond", "BSU" and "Aksjesparekonto" land within a few degrees: three barely-different pills scattered down a table are legible, three barely-different bands stacked against each other are not. The trade is that colours shift when the set of categories changes, which is unavoidable if even spacing is the goal.

## Motion

Motion is intentional and limited, split across the two style locations this document describes:

- `app/globals.css` defines `card-rise` (fade in + translate up), driving a page's top-level `.shell > section` entrance (staggered per section via `animation-delay`) and the `.budget-popover` open transition.
- `components/Toast.module.css` defines its own keyframe, `toast-in`, for the toast's entrance — module-scoped, since only `Toast.tsx` uses it.
- `components/StackedAreaChart.module.css` defines `tooltip-in` (a plain fade) for the `/sparing` chart tooltip, inside `@media (prefers-reduced-motion: no-preference)`.
- `components/CategoryDrilldown.module.css` likewise defines its own keyframe, `panel-in` (fade in + slide from the right), for the drill-down panel's entrance — module-scoped, since only `CategoryDrilldown.tsx` uses it.

These are gated in two ways, not by one shared rule: `card-rise` applies unconditionally and is neutralized by a blanket `@media (prefers-reduced-motion: reduce)` override in `globals.css` (forces `animation-duration`/`transition-duration` to `0.01ms`); `toast-in` and `panel-in` instead only ever apply inside `@media (prefers-reduced-motion: no-preference)` in their own module, so neither needs the override to begin with. Either pattern is fine for a new animation — pick whichever is more natural for where the keyframe lives.

## Responsive Rules

Primary breakpoints:

- `1024px`: tighter layout and container width.
- `720px`: the `/oversikt` category row moves its name onto its own line.
- `860px`: stacked navigation, full-width controls, single-column list rows. Inline editing rows switch to a 2-column grid.
- `640px` and `480px`: tighter spacing and mobile-friendly form inputs.

Design goals:

- No horizontal scrolling.
- Primary actions remain easy to reach on mobile.

## Accessibility

- Input fields use visible labels (not placeholder-only), and the label is **associated** with its control via `htmlFor`/`id` or an `aria-label`. The mobile new-transaction form on `/transaksjoner` had visible labels that named nothing — no `htmlFor`, no `id` on the controls — so all five fields read as unlabelled; they now use `mobile-new-{column}` ids, and `ItemAutocomplete` takes an `inputId` for the same reason.
- Focus states use both border and ring.
- Status text (`.status`, `.helper`) maintains good contrast on light surfaces. `.status` is a bordered banner with a leading `!` mark, not bare red words: every consumer feeds it a raw Supabase `error.message`, and unframed that read as stray red text between a heading and a card rather than as a system message.
- Reduced motion preferences are respected globally.
