"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconX } from "@/components/icons";
import { MONTH_NAMES, SHORT_MONTH_NAMES } from "@/lib/format";
import { addMonths, type MonthRef } from "@/lib/insights";
import { daysInMonth, isoDate, mondayOffset } from "@/lib/periodStats";
import styles from "./DateRangePicker.module.css";

const WEEKDAYS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

/** "3. des 2025", or "3. des" when `withYear` is false. */
function dayLabel(date: string, withYear = true) {
  const [year, month, day] = date.split("-").map(Number);
  return `${day}. ${SHORT_MONTH_NAMES[month - 1]}${withYear ? ` ${year}` : ""}`;
}

export function rangeLabel(from: string, to: string) {
  if (!from && !to) return "Alle datoer";
  if (from && !to) return `Fra ${dayLabel(from)}`;
  if (!from && to) return `Til ${dayLabel(to)}`;
  if (from === to) return dayLabel(from);
  return `${dayLabel(from, from.slice(0, 4) !== to.slice(0, 4))} – ${dayLabel(to)}`;
}

/**
 * One control for a from–to date range: a button stating the range, opening a
 * month calendar. The first tap sets the start, the second the end (tapping a
 * day before the start moves the start instead), and the popover closes once
 * both are set. Two native date inputs did the same job in twice the room, and
 * gave no sense of the span between them.
 */
export default function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const initial = (from || to || isoDate(new Date())).slice(0, 7).split("-").map(Number);
  const [month, setMonth] = useState<MonthRef>({ year: initial[0], month: initial[1] });

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(date: string) {
    if (!from || to) {
      onChange(date, "");
    } else if (date < from) {
      onChange(date, "");
    } else {
      onChange(from, date);
      setOpen(false);
    }
  }

  const prefix = `${month.year}-${String(month.month).padStart(2, "0")}-`;
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
  // While only the start is set, the hovered day previews the end.
  const end = to || (from && hover && hover >= from ? hover : "");
  const today = isoDate(new Date());

  return (
    <div className={styles["root"]} ref={root}>
      <button
        type="button"
        className={styles["trigger"]}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-empty={!from && !to ? "true" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {rangeLabel(from, to)}
      </button>
      {from || to ? (
        <button
          type="button"
          className={styles["clear"]}
          aria-label="Fjern datoer"
          title="Fjern datoer"
          onClick={() => onChange("", "")}
        >
          <IconX />
        </button>
      ) : null}
      {open ? (
        <div className={styles["popover"]} role="dialog" aria-label="Velg datoer">
          <div className={styles["head"]}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Forrige måned"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <IconChevronLeft />
            </button>
            <strong>
              {MONTH_NAMES[month.month - 1]} {month.year}
            </strong>
            <button
              type="button"
              className="icon-btn"
              aria-label="Neste måned"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <IconChevronRight />
            </button>
          </div>
          <div className={styles["grid"]} onMouseLeave={() => setHover(null)}>
            {WEEKDAYS.map((name) => (
              <span key={name} className={styles["weekday"]}>
                {name}
              </span>
            ))}
            {days.map((date, index) => {
              const edge = date === from || date === end;
              const inside = from && end && date > from && date < end;
              return (
                <button
                  key={date}
                  type="button"
                  className={styles["day"]}
                  style={index === 0 ? { gridColumnStart: mondayOffset(month) + 1 } : undefined}
                  data-edge={edge ? "true" : undefined}
                  data-inside={inside ? "true" : undefined}
                  data-today={date === today ? "true" : undefined}
                  aria-pressed={edge}
                  aria-label={dayLabel(date)}
                  onClick={() => pick(date)}
                  onMouseEnter={() => setHover(date)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <p className={styles["hint"]}>
            {!from || to ? "Velg første dag." : "Velg siste dag."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
