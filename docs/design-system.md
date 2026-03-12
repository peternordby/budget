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

## Typography

- Body text uses `--font-sans`.
- Headings use `--font-serif` for clear contrast.
- Field labels use uppercase with letter spacing for fast form scanning.

Type hierarchy:

- `h1` / hero: prominent, editorial headline.
- `.section-title`: section heading style.
- `.helper`: lower-emphasis supporting text.

## Layout and Spacing

Reusable primitives:

- `.shell`: page width and overall vertical rhythm.
- `.section-gap`: spacing between major sections.
- `.grid`: responsive auto-fit card layout.

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

Motion is intentional and limited:

- `rise` on page entry.
- `fade-up` for activity rows.
- `float-subtle` for key cards.

`prefers-reduced-motion` disables non-essential motion.

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
