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
  - Layout: `.shell`, `.section-gap`, `.toolbar` (`.field-wide`, `.toolbar-actions`)
  - CSV import panel: `.import`, `.import-head`, `.import-file`, `.import-preview`, `.import-errors`
  - Nav shell: `.nav`, `.brand-stack`, `.brand-kicker`, `.brand`, `.nav-links`, `.nav-meta`, `.user-chip`. `.user-chip` is now a link to `/profil` rather than a label, so `TopNav.module.css` adds `.user-link` (hover and active border) and `.user-name` (truncates, and hides below 860px so the avatar alone identifies the account). `TopNav.module.css` also adds `.nav-route-full`/`.nav-route-short`: exactly one is visible at a time, so the phone's bottom bar can say "Trans." where the header says "Transaksjoner". Five tabs is where full names stopped fitting a 375px screen; swapping the text in CSS rather than off a measured width keeps the nav a plain list with no layout jump.
  - Cards/sections: `.card`, `.section-title`, `.card-head` (`.card-head-meta`)
  - Forms: `.field`, `.field-label-row`, `.field-move`, `.form-grid`, `.form-actions`
  - Buttons: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-small`, `.btn.is-on`
  - Icon buttons: `.icon-btn` (`.icon-btn-sm`, `.icon-btn-lg`, `.icon-btn-confirm`, `.icon-btn-dismiss`, `.icon-btn-danger`)
  - Expandables: `.collapse-toggle`, `.collapse-chevron` (`.collapsed`)
  - Status/feedback: `.helper`, `.status`, `.empty`, `.badge`, `.badge-warn`
  - Stats: `.stat-row`, `.stat` (`.stat-small`), `.stat-label`, `.stat-value` (`.is-good`/`.is-bad`), `.stat-delta` (`.good`/`.bad`/`.neutral`)
  - Numerics: `.num`
  - `.collapse-toggle` + `.collapse-chevron` — the collapsible card header. One consumer now, `components/RecurringPanel.tsx` (the fixed-expenses panel on `/transaksjoner`); `/oversikt`'s collapsible category list is gone, having been a read-only copy of `/budsjett`'s rows. They stay global rather than moving into `RecurringPanel.module.css` because that is exactly the mistake this pair already caused once: `.collapse-chevron` lived in `oversikt.module.css`, module scoping put it out of RecurringPanel's reach, and RecurringPanel rendered with **no chevron at all** — the next collapsible would hit the same wall.
  - **`.icon-btn`** — the square icon control. It replaced seven near-identical private definitions that had drifted apart: `.theme-toggle`, `.field-move button`, `oversikt`'s `.icon-button`, `transaksjoner`'s `.delete-button`/`.save-button`/`.cancel-button`, `sparing`'s `.delete-button`, and `CategoryDrilldown`'s `.close-button` (which was a bare `×` glyph rather than a button at all). Between them they used four sizes (22/26/28/34px) and three disabled opacities (0.3/0.35/0.4). Now: three deliberate sizes — `.icon-btn` 28px for table rows, `.icon-btn-sm` 22px for a form label row, `.icon-btn-lg` 34px for the nav — and three tones. `.icon-btn-confirm`/`.icon-btn-dismiss` are the tinted green/red pair for inline editing, where the tick and cross *are* the affordance. `.icon-btn-danger` is neutral until hover, which is what a delete button in a long table needs: forty permanently red buttons read as forty warnings, not one destructive action. Both delete buttons in the app use it, so they finally match.
  - `.card-head` — the card header row: a `.section-title` on the left, meta (the period, a count, the sort order, a `.badge`) on the right. Formerly `.activity-head`, named for the one route that happened to use it first; it is now what every card opens with — `transaksjoner/page.tsx`, `components/RecurringPanel.tsx`, `components/Anomalies.tsx`, both `/oversikt` cards that have meta, all three `/innsikt` sections, and all four `/sparing` sections. It clears `.section-title`'s own bottom margin and supplies the 14px itself, so the spacing is identical whether a heading is wrapped in one or stands alone. `.card-head-meta` groups more than one thing on the meta side (RecurringPanel's active count plus its "N mangler" badge).
  - Semantic color: `.text-income`, `.text-expense`
  - **Stats** — `.stat-row` wraps a set of `.stat`s (label above value, optional `.stat-delta` chip or `.helper` line below). This replaced five independent copies of the same markup: `oversikt.module.css`'s `.gauge-stat*`, `MonthOverMonth.module.css`'s `.compare-stat*`/`.compare-chip*`, `innsikt.module.css`'s `.savings-stat`, `CategoryDrilldown.module.css`'s `.stats`/`.stat`, and `/transaksjoner`'s `.activity-total`. All five are gone. Use `.stat-small` where the figure sits inside a tile or panel rather than being a page-level number, `.is-good`/`.is-bad` on `.stat-value` to colour the figure itself, and `.stat-delta` for the change chip.
  - **`.num`** — `tabular-nums` plus `text-align: right`, for any cell holding money or a count. Amounts used to be left-aligned in both the activity table and the subscription table, which made a column of kroner impossible to compare by eye. A grid whose numeric column uses `.num` must right-align its header too (see `.list-sort.align-end` below).
  - **`.toolbar`** — a filter bar, and *only* filters: `.field`s flow along one row (`flex: 1 1 150px`, or `.field-wide` at `2 1 220px` for the search box, which is the control reached for first). The controls carry no `<label>` — `Alle kategorier` is both a select's placeholder and its reset value, so an uppercase caption over each one was pure noise, and an `aria-label` names them for a screen reader. Actions go in the card head (`.toolbar-actions`, which pins to the far end there too); `.toolbar-check` is gone with the checkbox it styled, now that the search scope is a select like its neighbours. Both replaced `.activity-controls`, an `auto-fit` grid that gave inputs, a checkbox and two buttons equal-width cells, so nothing shared a baseline and the export button wrapped onto a row of its own.
  - **`.import`** — the CSV import panel: a bordered-off block with `.import-head` (title + the accepted-columns line), a lightly restyled native `.import-file` input, and an `.import-preview` card stating what a confirm would write, with `.import-errors` as a `<details>` of skipped lines. Shared by `/sparing` (snapshots) and `/transaksjoner` (transactions) — it lived in `sparing.module.css` until the second importer needed the same panel.
  - Auth screen: `.auth-shell`, `.auth-card`
  - Icons: `.icon`
  - `.breakdown-dot` — a single small dot-swatch class, kept global specifically because `PeriodPicker` (its income/expense legend), `oversikt/page.tsx` (its category breakdown legend), and `innsikt/page.tsx` (its fixed/variable legend, added in the same phase as the route itself) all use it; splitting it into three component-local copies would just duplicate five lines of CSS three times over for no isolation benefit.
- **Component- or route-specific families live in a co-located `*.module.css`**, imported as `styles` and referenced as `styles["kebab-case-name"]` (not dot access, since the class names use hyphens):
  - `components/Anomalies.module.css`, `components/CategoryDrilldown.module.css`, `components/ItemAutocomplete.module.css`, `components/MonthOverMonth.module.css`, `components/PeriodPicker.module.css`, `components/RecurringPanel.module.css`, `components/Sparkline.module.css`, `components/Toast.module.css`, `components/TopNav.module.css`.
    - `CategoryDrilldown.module.css` styles the drill-down panel, opened from an `/innsikt` category tile: the dialog shell (`.panel`, `.header`, `.title`, `.close-button`, `.body`), the month bar chart (`.bars`, `.bar-col`, `.bar-track`, `.bar-fill`, `.bar-budget-mark`, `.bar-label`), the budget-vs-actual table (`.budget-table`, `.budget-row`, `.over`/`.under`), and the transaction list (`.transactions`, `.transaction-row`, `.transaction-item`, `.transaction-amount`); its mean/median pair uses the global `.stat-row`/`.stat stat-small`. Every level from `.body` down carries `min-width: 0`: grid items default to `min-width: auto`, so a row of nowrap columns sized the track to its own min-content and the 440px panel scrolled sideways instead — the budget-vs-actual table rendered as a list of month labels with every figure parked off-screen. The row is now `month | .budget-figures` (actual / budget / difference, right-aligned and free to wrap), which fits the panel at four figures where four rigid columns needed 667px. Its `.budget-row` is module-scoped and unrelated to the same-named, unused legacy class still sitting in `globals.css`.
    - `Sparkline.module.css` is gone: `Sparkline` now draws from the shared `charts.module.css` (`.sparkline-wrap`, `.sparkline-line`, `.sparkline-area`, `.sparkline-dot`, `.sparkline-guide`) along with every other chart.
    - `StackedAreaChart.module.css` styles the `/sparing` chart and its legend — what is left of it, now that the axis gutters (`.chart`, `.y-label`, `.x-axis`, `.x-label`) and the tooltip family are the shared kit's: the plot box (`.plot`), the bands (`.band`, `.band-edge`, `.point-mark`, `.total-line`), the hover guide and its tooltip (`.guide`, `.guide-dot`, `.hit`, `.tooltip` with its `data-side`/`data-flip` placement variants, `.tooltip-date`, `.tooltip-total`, `.tooltip-change`), and the legend/readout rows (`.legend`, `.legend-head`, `.legend-row` with `.is-dragging`/`.is-drop-target`, `.swatch`, `.legend-name`, `.legend-name-text`, `.stale`, `.legend-move`). Two rules are load-bearing rather than cosmetic: `.plot`'s left margin *is* the value-axis gutter, which is what lets an HTML label positioned by percentage line up with an SVG coordinate (the viewBox maps 1:1 onto the plot box, so no text has to live inside the stretched viewBox and get squashed); and `.legend-name-text` truncates while `.stale` is `flex: none`, so a long category name gives way rather than clipping the badge that exists to report the problem. Below 480px only the first and last date labels are kept — the rest cannot fit without overlapping.
  - `app/(app)/oversikt/oversikt.module.css` — the budget gauge (`.gauge-main-total` dims the "/ budget" half of the lead figure) and the expense-breakdown legend, plus (single-consumer, relocated out of `globals.css`) `.insight-chip` (`.insight-good`/`.insight-warn`/`.insight-bad`). The whole `.category-chart-*`/`.cat-*` family is gone with the category list itself, which was a read-only copy of `/budsjett`'s rows; so are `.category-head` (a private copy of `.card-head`), `.budget-popover*` and `.category-card` — the last three when budget editing moved to `/budsjett`, taking the popover, the pencil column and the z-index lifting that existed only to paint the popover over the next card.
  - `app/(app)/budsjett/budsjett.module.css` — the budget editor's row family: `.budget-list`, `.budget-header`, `.budget-row`, `.budget-total`, `.budget-name`, `.budget-dot`, `.budget-kind`, `.budget-input`, `.budget-actions`, and the full-bleed `.budget-track` (just the slot now — track, fill and budget marker are the shared `<BulletBar>`, so this row and the `/oversikt` bar could not drift apart; `.budget-bar` went with that). A row is read-only until its pencil is pressed, which adds two: `.budget-kind-text` is the type cell before that, and `.budget-pending` marks a budget figure a `Kopier fra …` put on the row that nobody has saved yet.
    - A budget row is six real grid columns — name (with its dot) | type | budget | brukt | igjen | actions — with the track underneath. Below 860px it drops its header and folds to three.
  - `app/(app)/transaksjoner/transaksjoner.module.css` — the activity table's `.list`/`.list-header`/`.list-row` family (including `--list-cols`) and `.list-sort.align-end` (the amount column is `.num`, so its draggable header button has to right-align with it; keyed off the column identity, since the order is user-controlled), plus `.activity-total-row` (now just the rule below the `.stat-row` of totals — `.activity-controls`, `.activity-clear`, `.activity-export`, `.activity-toggle`, `.activity-total` and `.activity-total-meta` are gone, replaced by `.toolbar` and `.stat*`), inline spreadsheet editing (`.cell-input`, `.cell-input-number`, `.new-row`, `.editing-row`, `.row-actions`, `.save-button`, `.cancel-button`, `.edit-button`, `.delete-button`, `.mobile-new-row-card`, `.mobile-new-row-grid`), and `.category-pill`.
  - `app/(app)/profil/profil.module.css` — just the identity header (`.identity`, `.identity-text`, `.identity-name`). Every form on the page is `.card` + `.card-head` + `.field`/`.form-grid`/`.form-actions` with no additions, which is the point: an account-settings page that needed its own form styling would mean the shared ones were incomplete.
  - `components/Avatar.module.css` — `.avatar` and its `.lg` size. Two sizes only: 26px for the nav chip, 56px for the profile header. It is now an `<img>` holding a seeded DiceBear drawing rather than a coloured circle with initials in it, so the rule is a size, a `border-radius: 50%` and the `overflow: hidden` that clips DiceBear's full-bleed background rect into that circle — no type or colour left.
  - `app/(app)/sparing/sparing.module.css` — the order-controls row between chart and legend (`.legend-head-row`) and the snapshot history table (`.history`, `.history-header`, `.history-row`, `.delete-button`). The chart itself lives in `components/StackedAreaChart.module.css`; the earlier per-category tiles and total-bar-chart families are gone, replaced by that one chart.
  - `app/(app)/innsikt/innsikt.module.css` — the income-vs-expense net chart (`.net-chart`, `.net-col`, `.net-track`, `.net-zero`, `.net-bar` with `.surplus`/`.deficit`, `.net-label`), the average-month mix bar (`.mix-bar`, `.mix-segment`, `.mix-legend`, `.mix-legend-item`, `.mix-legend-name`, `.mix-trend`), the category-trend tile grid (`.category-grid`, `.category-tile`, `.tile-stat`) and its hover readout (`.tile-chart`, `.tile-hits`, `.tile-hit`, `.tile-tooltip` with its `data-side` variants), and the subscription table (`.subscription-table`, `.subscription-row`, `.subscription-action`). The `.split-*` family (fixed vs. variable) and the `.savings-*` layout are gone with the sections they styled; `.mix-*` is what replaced the first. `.mix-bar` is a deliberate local copy of `/oversikt`'s `.breakdown-bar` rather than a promotion of it — that bar splits spending into categories, this one splits an average month's income into what happens to it, and they would drift apart the moment either grows a state.
    - `.net-col` is `flex: 1 1 0` with a `min-width`, and `.net-track` is `width: 100%` capped at 30px, so the chart spans its card and only falls back to horizontal scrolling once the columns would get too thin to label.
    - `--zero-pct` is set on `.net-chart` from the data, not fixed at 50%: a window with no deficit should not spend half its height on an empty lower plot. `.net-zero` is drawn per column rather than once across the chart, so the baseline cannot drift out of alignment with the bars standing on it.
    - `.tile-tooltip` is `pointer-events: none` — without it the tooltip steals the pointer from the `.tile-hit` areas underneath and flickers. It is HTML over the SVG rather than text inside it, the same reason `StackedAreaChart` keeps its labels outside the stretched viewBox.
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

Categories are painted from **eight fixed slots**, `--cat-1`..`--cat-8` in `app/globals.css`, with a selected set of dark steps rather than an automatic flip. `lib/categoryColor.ts` maps a name to a slot and builds the CSS expression:

- `getCategorySlot(name)` — one category in isolation. Correct for a pill in a table, a dot in a list, a single bar.
- `categorySlots(names)` — a whole set. Required wherever several are drawn *touching each other*: it guarantees distinct slots while slots last, by letting each name keep its preferred slot and walking to the next free one where it collides.
- `categoryColor(slot)` for a mark; `categoryTint(slot)`/`categoryInk(slot)` for the activity table's pill (a 15% wash of the slot and text mixed 34% toward `--ink`).

**The slot order is the colour-vision-deficiency safety mechanism, not a mood.** Adjacent slots are what end up touching in a stack or sitting next to each other in a legend, and this sequence is the one that clears the gates: worst adjacent pair CVD ΔE 9.1 light / 8.4 dark, normal-vision ΔE 19.6 / 19.3, every slot inside the lightness band, all eight ≥ 3:1 on the dark card. Three light-mode slots (aqua, yellow, magenta) sit at 2.1–2.8:1 on the light card, which is allowed only because every chart here prints the figure as text beside the mark — the relief rule. Re-ordering the slots or re-picking a step means re-validating the whole set, not eyeballing it.

This replaced hue-from-name-hash, painted as `hsl(hue, --seg-s, --seg-l)` with one saturation and lightness for every hue. Two things were wrong with it, both measured rather than felt:

- **HSL lightness is not perceptual.** At a fixed `56%`, the yellows and cyans landed at OKLCH L 0.77 and **1.9:1 against the card** — effectively invisible — while the blues and violets sat comfortably at 3.5:1. The whole `--seg-*`/`--dot-*`/`--bar-*`/`--pill-*` family of saturation/lightness tokens existed to paper over that per surface, and is gone with it.
- **Evenly spaced hues collapse under CVD.** 45° apart, blue and violet came out ΔE 0.2 under deuteranopia: the same colour. `categoryHues` spaced the set evenly round the wheel precisely to keep neighbours apart, and that is the spacing that failed.

The slot scheme also fixes what `categoryHues` was documented as trading away: it spaced *the whole set*, so **adding one category repainted every other one**. A set with no slot collisions is now exactly `getCategorySlot`, and adding a category changes another's colour only when it actually lands on top of it.

Slot 8 is a red close to `--expense`. That is only reached with eight or more categories, and a category's own colour is never used on a bar that also carries over/under-budget meaning (those bars are `--income`/`--expense` by definition), so the two cannot be confused in one mark.

## Motion

Motion is intentional and limited, and now has **one source of truth for its timing**: `lib/motion.ts` exports one easing curve (`EASE`, the curve `card-rise` already used) and three durations — `T_FAST` (140 ms, pointer feedback: hover, press, tooltip), `T_BASE` (220 ms, a state change the user asked for: a panel opening, a section expanding) and `T_DRAW` (450 ms, data arriving: bars growing from the baseline, a line drawing itself), plus `stagger(index)` for a capped per-mark entrance delay. Don't inline a duration; if a new one is genuinely needed, add it there.

Two mechanisms, split by what is being animated:

- **`motion` (the library) for anything driven by state or data.** Note the one deliberate exception: `MonthColumns`' bars are static, because their keys all change when the window shifts and the entrance replayed on every arrow press. Chart marks growing, `ChartTooltip` fading, `Collapse` animating a card section's height, `Toast` entering *and leaving*, and `CategoryDrilldown` sliding in and out. Enter/exit pairs go through `AnimatePresence` — the toast and the panel used to be unmounted outright, so both animated in and then vanished mid-sentence.
- **CSS for anything that is only ever a hover or focus transition**, plus the one page-level entrance: `app/globals.css` defines `card-rise` (fade in + translate up), driving a page's top-level `.shell > section` entrance (staggered per section via `animation-delay`).

Reduced motion is handled once per mechanism, and neither needs a per-component check:

- **`motion`**: `<MotionConfig reducedMotion="user">` in `app/(app)/layout.tsx` wraps the whole app.
- **CSS**: the blanket `@media (prefers-reduced-motion: reduce)` override in `globals.css` forces `animation-duration`/`transition-duration` to `0.01ms`.

The per-module keyframes this section used to list are gone with the code that needed them: `toast-in` (now `AnimatePresence` in `Toast.tsx`), `panel-in` (now `AnimatePresence` in `CategoryDrilldown.tsx`) and `tooltip-in` (the `/sparing` tooltip is the shared `ChartTooltip`).

## Charts

Charts are SVG drawn in **measured pixels**, not in a viewBox stretched with `preserveAspectRatio="none"`. That stretch is why the old charts looked the way they did: it scales text and strokes non-uniformly, so every label had to be HTML positioned in percentages over the SVG and every stroke needed `vector-effect: non-scaling-stroke`. `useMeasure` (one `ResizeObserver`) buys back plain `<text>`, honest stroke widths, and one tooltip implementation for the whole app.

- **`components/charts.tsx`** is the kit: `useMeasure`, `ChartTooltip`, `GridLines`, `BulletBar`, `GaugeArc`, `ShareBar`, `Collapse` and `bandLayout`. **`components/charts.module.css`** styles all of it, and is the one CSS Module with several importers (`MonthColumns.tsx` and `StackedAreaChart.tsx` also pull the axis and tooltip classes from it) — deliberately, since the point is that gridlines and tooltips are defined exactly once.
- **The arithmetic lives in `lib/chart.ts`**, not in the components: `axisTicks`, `shortAmount`, `labelledDates`, `divergingTicks` and `shareWidths`. They are tested (`lib/chart.test.ts`, and `lib/savings.test.ts` for the three that predate the kit) rather than eyeballed on screen.
- **A tooltip may not overflow the chart it belongs to.** Two rules in `globals.css` box it in. `.card > *` sets `position: relative; z-index: 1` on every direct child, so a *later* sibling in the same card — a legend, a stat row — paints over anything overflowing an earlier one: equal z-index, DOM order decides. And `.card` carries `backdrop-filter`, which always makes an element a stacking context, so overflowing the card entirely is no better; the next section covers it. `ChartTooltip` picks its side from the anchor's `y`, and a chart whose tooltip would overflow passes `flip` to point it inward. `ShareBar` does: its bar sits 24px from the top of the card, so the derived "below" sent the tooltip under the legend beneath it.
- **Every chart carries its own vertical air** (`margin: 14px 0` on the chart wrapper in `charts.module.css`), so the gap above a chart is the same on every route. Each card used to supply its own, and they had drifted to 2px, 12px and 14px.
- **Mark specs** follow the data-viz conventions: bars capped at **24px** rather than filling their band, a **2px surface gap** between the two bars of a grouped column (white separating them, never a stroke round each bar), 2px lines, gridlines as solid hairlines one step off the surface, area fills as a ~14% wash rather than a saturated block, and a 2px surface ring on the sparkline's hover dot. Corner radius is bounded by the bar's own height, or a two-pixel bar renders as a floating lozenge.
- **`tabular-nums` only where numbers align vertically** — table rows, axis ticks, `.num`. The two large standalone figures on `/oversikt` (the gauge percentage and the lead amount) use proportional figures: equal-width digits read as loose spacing at display sizes.
- **Hit areas are HTML, layered over the SVG** — a tiled row of real `<button>`s when the chart is clickable (the period picker), `<div role="img">`s when it is a readout. A real button brings keyboard focus, `aria-pressed` and a focus ring; each one's accessible name is built from the same rows the tooltip renders, so `ChartTooltip` itself is `aria-hidden` and nothing is announced twice.
- `ShareBar` replaced two near-identical CSS copies of the same bar (`/oversikt`'s `.breakdown-bar` and `/innsikt`'s `.mix-bar`), which had been kept separate on the reasoning that they would drift once either grew a state — and then both grew the same state, a hover readout. `MonthColumns` likewise replaced three hand-rolled div-and-percentage month charts with three different hover behaviours.

## Responsive Rules

Primary breakpoints:

- `1024px`: tighter layout and container width.
- `860px`: the `/budsjett` row drops its header and folds six columns into three. (There used to be a `720px` rule for `/oversikt`'s category row; that row is gone.)
- `640px`: the nav's route labels switch to their short forms in the bottom tab bar.
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
