import { describe, expect, it } from "vitest";
import {
  lastDayOfMonth,
  materializationDate,
  pendingTemplates,
  type BookedRef,
  type RecurringTemplate,
} from "@/lib/recurring";

function template(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 1,
    item: "Husleie",
    price: 12000,
    category_id: 3,
    tag: null,
    day_of_month: 1,
    active: true,
    ...overrides,
  };
}

describe("lastDayOfMonth", () => {
  it("returns 31 for January", () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31);
  });

  it("returns 28 for a non-leap February", () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
  });

  it("returns 29 for a leap February", () => {
    expect(lastDayOfMonth(2028, 2)).toBe(29);
  });
});

describe("materializationDate", () => {
  it("uses the template day when the month is long enough", () => {
    expect(materializationDate(template({ day_of_month: 15 }), 2026, 8)).toBe(
      "2026-08-15"
    );
  });

  it("clamps to the last day of a short month", () => {
    expect(materializationDate(template({ day_of_month: 31 }), 2026, 2)).toBe(
      "2026-02-28"
    );
  });

  it("pads single-digit months and days", () => {
    expect(materializationDate(template({ day_of_month: 5 }), 2026, 3)).toBe(
      "2026-03-05"
    );
  });
});

describe("pendingTemplates", () => {
  it("returns active templates that have no booked row that month", () => {
    const templates = [template({ id: 1 }), template({ id: 2, item: "Strøm" })];
    const booked: BookedRef[] = [];

    const result = pendingTemplates(templates, booked, 2026, 8);

    expect(result.map((t) => t.id)).toEqual([1, 2]);
  });

  it("excludes inactive templates", () => {
    const templates = [template({ id: 1, active: false }), template({ id: 2 })];

    const result = pendingTemplates(templates, [], 2026, 8);

    expect(result.map((t) => t.id)).toEqual([2]);
  });

  it("excludes templates already booked in the target month", () => {
    const templates = [template({ id: 1 }), template({ id: 2 })];
    const booked: BookedRef[] = [{ recurring_id: 1, date: "2026-08-01" }];

    const result = pendingTemplates(templates, booked, 2026, 8);

    expect(result.map((t) => t.id)).toEqual([2]);
  });

  it("ignores rows booked in a different month", () => {
    const templates = [template({ id: 1 })];
    const booked: BookedRef[] = [{ recurring_id: 1, date: "2026-07-01" }];

    const result = pendingTemplates(templates, booked, 2026, 8);

    expect(result.map((t) => t.id)).toEqual([1]);
  });

  it("ignores manual rows that carry no recurring_id", () => {
    const templates = [template({ id: 1 })];
    const booked: BookedRef[] = [{ recurring_id: null, date: "2026-08-01" }];

    const result = pendingTemplates(templates, booked, 2026, 8);

    expect(result.map((t) => t.id)).toEqual([1]);
  });

  it("tolerates booked rows with no date", () => {
    const templates = [template({ id: 1 })];
    const booked: BookedRef[] = [{ recurring_id: 1, date: null }];

    const result = pendingTemplates(templates, booked, 2026, 8);

    expect(result.map((t) => t.id)).toEqual([1]);
  });

  it("ignores a booked row from the same month of a different year", () => {
    const templates = [template({ id: 1 })];
    const booked: BookedRef[] = [{ recurring_id: 1, date: "2025-08-01" }];

    const result = pendingTemplates(templates, booked, 2026, 8);

    expect(result.map((t) => t.id)).toEqual([1]);
  });

  it("returns nothing when bookedKnown is false, even with pending templates", () => {
    const templates = [template({ id: 1 }), template({ id: 2 })];
    const booked: BookedRef[] = [];

    const result = pendingTemplates(templates, booked, 2026, 8, false);

    expect(result).toEqual([]);
  });

  it("distinguishes an uncovered month from a genuinely empty one given identical inputs", () => {
    // Same templates, same (empty) booked list, same month — the only thing
    // that differs is whether the caller's fetch actually covers this month.
    // An uncovered month must read as "unknown", not "nothing pending", or a
    // user could be offered to generate rows that are already booked outside
    // the fetched window.
    const templates = [template({ id: 1 }), template({ id: 2 })];
    const booked: BookedRef[] = [];

    const uncoveredMonth = pendingTemplates(templates, booked, 2026, 8, false);
    const genuinelyEmptyMonth = pendingTemplates(templates, booked, 2026, 8, true);

    expect(uncoveredMonth).toEqual([]);
    expect(genuinelyEmptyMonth.map((t) => t.id)).toEqual([1, 2]);
    expect(uncoveredMonth).not.toEqual(genuinelyEmptyMonth);
  });
});
