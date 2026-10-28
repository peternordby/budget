// The icon set, in one place.
//
// These were previously local `function IconX()` declarations copy-pasted into
// whichever route needed them — three copies of the chevron, and two *different*
// trash cans for the same delete action on /transaksjoner and /sparing.
//
// Every icon inherits `.icon` from app/globals.css (1em square, currentColor
// stroke, no fill), so size and colour come from whatever contains it.
// ThemeToggle keeps its own sun/moon locally: they have exactly one consumer
// and belong to that control.

export function IconChevronDown() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconChevronUp() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

export function IconChevronLeft() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconFilter() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  );
}

export function IconMore() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

export function IconPencil() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconX() {
  return (
    <svg className="icon" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** A drag handle: two columns of three dots. Filled, unlike the stroked set. */
export function IconGrip() {
  return (
    <svg className="icon" viewBox="0 0 24 24" style={{ fill: "currentColor", stroke: "none" }}>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}
