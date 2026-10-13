"use client";

import { useMemo, useState, type CSSProperties, type FocusEvent, type MouseEvent } from "react";
import { BulletBar, ChartTooltip, type TooltipContent } from "@/components/charts";
import { categoryColor } from "@/lib/categoryColor";
import { formatCurrency, SHORT_MONTH_NAMES } from "@/lib/format";
import { monthKey, type LedgerEntry, type MonthRef } from "@/lib/insights";
import {
  calendarDays,
  isoDate,
  kiloAmount,
  shortDate,
  weekdayAverages,
  type CalendarDay,
} from "@/lib/periodStats";
import styles from "./MoneyCalendar.module.css";

const WEEKDAYS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];
const WEEKDAY_NAMES = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];

type Props = {
  entries: LedgerEntry[];
  /** The selected months, ascending. One draws a calendar, more a heatmap. */
  months: MonthRef[];
  /** Category -> colour slot, shared with the other charts on the page. */
  slots: Map<string, number>;
};

/**
 * Days washed red by how much went out. Square root rather than linear: rent
 * day is ten times an ordinary day, and on a linear wash every other day would
 * be the same pale pink.
 */
function wash(spent: number, max: number) {
  if (!spent || max <= 0) return undefined;
  return `color-mix(in oklab, var(--expense) ${Math.round(8 + 50 * Math.sqrt(spent / max))}%, var(--surface-solid))`;
}

function label(day: CalendarDay) {
  const top = day.top.map((entry) => `${entry.item} ${formatCurrency(entry.amount)}`).join(", ");
  return `${shortDate(day.date, true)}: ${formatCurrency(day.spent)} ut${
    day.income ? `, ${formatCurrency(day.income)} inn` : ""
  }${top ? `. ${top}` : ""}`;
}

export default function MoneyCalendar({ entries, months, slots }: Props) {
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const colorOf = (category: string) => categoryColor(slots.get(category) ?? 0);

  // The heatmap's tooltip always hangs upward: below it is the weekday
  // profile, a later sibling in the card that would paint over it.
  function show(element: HTMLElement, day: CalendarDay, multiYear: boolean) {
    const box = element.offsetParent as HTMLElement;
    setTooltip({
      flip: months.length > 1 ? "above" : undefined,
      x: element.offsetLeft + element.offsetWidth / 2,
      y: element.offsetTop,
      boxWidth: box.clientWidth,
      title: shortDate(day.date, multiYear),
      rows: [
        { label: "Ut", value: formatCurrency(day.spent) },
        ...(day.income ? [{ label: "Inn", value: formatCurrency(day.income), tone: "good" as const }] : []),
        ...day.top.map((entry) => ({
          label: entry.item,
          value: formatCurrency(entry.amount),
          tone: "muted" as const,
          swatch: colorOf(entry.category),
        })),
      ],
    });
  }

  const hover: Hover = (day, multiYear = false) => ({
    onMouseEnter: (event: MouseEvent<HTMLElement>) => show(event.currentTarget, day, multiYear),
    onFocus: (event: FocusEvent<HTMLElement>) => show(event.currentTarget, day, multiYear),
    onMouseLeave: () => setTooltip(null),
    onBlur: () => setTooltip(null),
  });

  return months.length === 1 ? (
    <MonthGrid entries={entries} month={months[0]} colorOf={colorOf} hover={hover} tooltip={tooltip} />
  ) : (
    <Heatmap entries={entries} months={months} hover={hover} tooltip={tooltip} />
  );
}

type Hover = (
  day: CalendarDay,
  multiYear?: boolean
) => {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onBlur: () => void;
};

function MonthGrid({
  entries,
  month,
  colorOf,
  hover,
  tooltip,
}: {
  entries: LedgerEntry[];
  month: MonthRef;
  colorOf: (category: string) => string;
  hover: Hover;
  tooltip: TooltipContent | null;
}) {
  const days = useMemo(() => calendarDays(entries, [month]), [entries, month]);
  const max = Math.max(0, ...days.map((day) => day.spent));

  return (
    <div className={styles["calendar"]}>
      {WEEKDAYS.map((name) => (
        <span key={name} className={styles["weekday"]} aria-hidden="true">
          {name}
        </span>
      ))}
      {days.map((day, index) => (
        <div
          key={day.date}
          role="img"
          tabIndex={0}
          className={styles["day"]}
          data-empty={day.spent === 0 ? "true" : undefined}
          style={{ gridColumnStart: index === 0 ? day.weekday + 1 : undefined, background: wash(day.spent, max) }}
          aria-label={label(day)}
          {...hover(day)}
        >
          <span className={styles["day-head"]}>
            <span className={styles["day-number"]}>{day.day}</span>
            <span className={styles["dots"]} aria-hidden="true">
              {day.income ? <span className={styles["dot"]} style={{ background: "var(--income)" }} /> : null}
              {day.top[0] ? (
                <span className={styles["dot"]} style={{ background: colorOf(day.top[0].category) }} />
              ) : null}
            </span>
          </span>
          {day.spent ? <span className={styles["day-amount"]}>{kiloAmount(day.spent)}</span> : null}
        </div>
      ))}
      <ChartTooltip content={tooltip} />
    </div>
  );
}

/**
 * Several months: one column per week, one row per weekday, so a year fits on
 * one line and the rhythm of the weeks — expensive weekends, quiet Mondays,
 * the first of the month — shows as a pattern. One block per calendar year:
 * two years in a single strip was a hundred-odd columns of 6px cells with
 * the month labels piled on each other.
 *
 * A day only counts — coloured, and in the figures under the grid — when its
 * month is selected, has happened, and has *any* transaction. A month with no
 * rows at all is before the ledger began (or simply not recorded), not a month
 * of zero spending; counting it turned a year picked before the first
 * transaction into hundreds of "days without spending".
 */
function Heatmap({
  entries,
  months,
  hover,
  tooltip,
}: {
  entries: LedgerEntry[];
  months: MonthRef[];
  hover: Hover;
  tooltip: TooltipContent | null;
}) {
  const today = isoDate(new Date());
  const { years, counted } = useMemo(() => {
    const first = months[0];
    const last = months[months.length - 1];
    const selected = new Set(months.map((ref) => monthKey(ref.year, ref.month)));
    const withData = new Set(entries.map((entry) => entry.date.slice(0, 7)));
    // Inside one year, just the selected span, so three months get big cells.
    // Across years, every block is a whole January–December, so the years
    // line up week for week and share one cell size; days outside the
    // selection are blank.
    const years: { year: number; span: MonthRef[]; days: CalendarDay[] }[] = [];
    for (let year = first.year; year <= last.year; year += 1) {
      const from = first.year === last.year ? first.month : 1;
      const to = first.year === last.year ? last.month : 12;
      const span = Array.from({ length: to - from + 1 }, (_, i) => ({ year, month: from + i }));
      years.push({ year, span, days: calendarDays(entries, span) });
    }
    const counted = new Set(
      years
        .flatMap((block) => block.days)
        .filter((day) => {
          const key = day.date.slice(0, 7);
          return selected.has(key) && withData.has(key) && day.date <= today;
        })
        .map((day) => day.date)
    );
    return { years, counted };
  }, [entries, months, today]);

  const countedDays = years.flatMap((block) => block.days).filter((day) => counted.has(day.date));
  const max = Math.max(0, ...countedDays.map((day) => day.spent));
  const multiYear = years.length > 1;
  const averages = weekdayAverages(countedDays, today);
  const peak = averages.indexOf(Math.max(...averages));
  const quiet = countedDays.filter((day) => day.spent === 0).length;
  const perDay = countedDays.length
    ? countedDays.reduce((sum, day) => sum + day.spent, 0) / countedDays.length
    : 0;

  return (
    <>
      {/* A year with nothing in it (between the first transaction and the
          rest, say) would be a whole block of blanks. */}
      {years
        .filter((block) => block.days.some((day) => counted.has(day.date)))
        .map(({ year, span, days }) => {
        const offset = days[0]?.weekday ?? 0;
        const weeks = Math.ceil((offset + days.length) / 7);
        return (
          <div key={year} className={styles["heatmap-year"]}>
            {multiYear ? <span className={styles["heatmap-year-label"]}>{year}</span> : null}
            <div
              className={styles["heatmap"]}
              style={{ "--weeks": weeks } as CSSProperties}
              role="group"
              aria-label={`Forbruk per dag, ${year}`}
            >
              {span.map((ref) => {
                const firstDay = days.findIndex((day) => day.date.startsWith(monthKey(ref.year, ref.month)));
                return (
                  <span
                    key={monthKey(ref.year, ref.month)}
                    className={styles["heatmap-month"]}
                    style={{ gridColumn: Math.floor((offset + firstDay) / 7) + 2, gridRow: 1 }}
                    aria-hidden="true"
                  >
                    {SHORT_MONTH_NAMES[ref.month - 1]}
                  </span>
                );
              })}
              {WEEKDAYS.map((name, row) =>
                row % 2 === 0 ? (
                  <span
                    key={name}
                    className={styles["heatmap-weekday"]}
                    style={{ gridColumn: 1, gridRow: row + 2 }}
                    aria-hidden="true"
                  >
                    {name}
                  </span>
                ) : null
              )}
              {days.map((day, index) => {
                const style = { gridColumn: Math.floor((offset + index) / 7) + 2, gridRow: day.weekday + 2 };
                return counted.has(day.date) ? (
                  <div
                    key={day.date}
                    role="img"
                    tabIndex={0}
                    className={styles["cell"]}
                    style={{ ...style, background: wash(day.spent, max) }}
                    aria-label={label(day)}
                    {...hover(day, multiYear)}
                  />
                ) : (
                  <span key={day.date} className={styles["cell-off"]} style={style} aria-hidden="true" />
                );
              })}
              <ChartTooltip content={tooltip} />
            </div>
          </div>
        );
      })}

      {countedDays.length ? (
        <div className={styles["weekdays"]}>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Dyreste ukedag</span>
              <strong className="stat-value">{WEEKDAY_NAMES[peak].replace(/^./, (c) => c.toUpperCase())}</strong>
              <span className="helper">{formatCurrency(Math.round(averages[peak]))} i snitt</span>
            </div>
            <div className="stat">
              <span className="stat-label">Snitt per dag</span>
              <strong className="stat-value">{formatCurrency(Math.round(perDay))}</strong>
              <span className="helper">{countedDays.length} dager med data</span>
            </div>
            <div className="stat">
              <span className="stat-label">Dager uten utgifter</span>
              <strong className="stat-value">{quiet}</strong>
              <span className="helper">{Math.round((quiet / countedDays.length) * 100)} % av dagene</span>
            </div>
          </div>
          <div className={styles["weekday-bars"]}>
            {averages.map((average, index) => (
              <div key={index} className={styles["weekday-bar"]} data-peak={index === peak ? "true" : undefined}>
                <span className={styles["weekday-name"]}>{WEEKDAYS[index]}</span>
                <BulletBar
                  fraction={averages[peak] ? average / averages[peak] : 0}
                  color={index === peak ? "var(--expense)" : "color-mix(in oklab, var(--expense) 45%, var(--surface-solid))"}
                  height={8}
                  ariaLabel={`${WEEKDAY_NAMES[index]}: ${formatCurrency(Math.round(average))} i snitt`}
                />
                <span className="num">{formatCurrency(Math.round(average))}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
