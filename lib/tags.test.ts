import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "@/lib/insights";
import { orderTags, tagForDate, tagLabels, tagSummaries, type Tag } from "@/lib/tags";

let nextId = 1;
function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: nextId++,
    item: "Kaffe",
    amount: 100,
    category: "Spise ute",
    kind: "variable",
    date: "2026-07-01",
    tag: "Roma",
    tagId: 1,
    ...overrides,
  };
}

function tag(overrides: Partial<Tag> = {}): Tag {
  return { id: 1, name: "Roma", start: null, end: null, budget: null, ...overrides };
}

describe("tagSummaries", () => {
  it("spans an undated tag from first to last purchase", () => {
    const [roma] = tagSummaries(
      [
        entry({ date: "2026-07-01", amount: 300 }),
        entry({ date: "2026-07-03", amount: 1200, category: "Reise" }),
        entry({ date: "2026-07-03", amount: 50 }),
      ],
      [tag()]
    );
    expect(roma.total).toBe(1550);
    expect(roma.count).toBe(3);
    expect(roma.days).toBe(3);
    expect(roma.before).toBe(0);
    expect(roma.during).toBe(1550);
    expect(roma.daily.map((day) => day.spent)).toEqual([300, 0, 1250]);
    expect(roma.byCategory).toEqual([
      { category: "Reise", value: 1200 },
      { category: "Spise ute", value: 350 },
    ]);
    expect(roma.top[0].amount).toBe(1200);
  });

  it("counts tickets bought ahead in the total but not in the trip's days", () => {
    const [roma] = tagSummaries(
      [
        entry({ date: "2026-03-10", amount: 4000 }),
        entry({ date: "2026-07-02", amount: 600 }),
        entry({ date: "2026-07-20", amount: 200 }),
      ],
      [tag({ start: "2026-07-01", end: "2026-07-07" })]
    );
    expect(roma.dated).toBe(true);
    expect(roma.days).toBe(7);
    expect(roma.total).toBe(4800);
    expect([roma.before, roma.during, roma.after]).toEqual([4000, 600, 200]);
    expect(roma.daily).toHaveLength(7);
    expect(roma.daily[1].spent).toBe(600);
  });

  it("crosses a month end, and leaves out untagged rows, income and savings", () => {
    const [roma] = tagSummaries(
      [
        entry({ date: "2026-06-30" }),
        entry({ date: "2026-07-01" }),
        entry({ tagId: null, amount: 9999 }),
        entry({ kind: "income", amount: 9999 }),
        entry({ kind: "savings", amount: 9999 }),
      ],
      [tag()]
    );
    expect(roma.total).toBe(200);
    expect(roma.days).toBe(2);
  });

  it("keeps the order of the tags it is given, and skips tags with no spending", () => {
    const summaries = tagSummaries(
      [entry({ tagId: 1 }), entry({ tagId: 2 })],
      [tag({ id: 2, name: "Berlin" }), tag({ id: 3, name: "Tom" }), tag()]
    );
    expect(summaries.map((summary) => summary.tag.name)).toEqual(["Berlin", "Roma"]);
  });
});

describe("orderTags", () => {
  it("puts current, then upcoming, then past, then undated", () => {
    const ordered = orderTags(
      [
        tag({ id: 1, name: "Udatert" }),
        tag({ id: 2, name: "Gammel", start: "2025-01-01", end: "2025-01-05" }),
        tag({ id: 3, name: "Nylig", start: "2026-09-01", end: "2026-09-05" }),
        tag({ id: 4, name: "Senere", start: "2027-05-01", end: "2027-05-05" }),
        tag({ id: 5, name: "Snart", start: "2026-12-01", end: "2026-12-05" }),
        tag({ id: 6, name: "Nå", start: "2026-10-20", end: "2026-10-30" }),
      ],
      "2026-10-28"
    );
    expect(ordered.map((t) => t.name)).toEqual([
      "Nå",
      "Snart",
      "Senere",
      "Nylig",
      "Gammel",
      "Udatert",
    ]);
  });
});

describe("tagForDate", () => {
  it("finds the tag whose dates hold the day, ends included", () => {
    const tags = [tag({ start: "2026-07-01", end: "2026-07-07" })];
    expect(tagForDate(tags, "2026-07-07")?.id).toBe(1);
    expect(tagForDate(tags, "2026-07-08")).toBeUndefined();
    expect(tagForDate([tag()], "2026-07-01")).toBeUndefined();
  });
});

describe("tagLabels", () => {
  it("adds the dates only where a name repeats", () => {
    const labels = tagLabels([
      tag({ id: 1, name: "Hytta", start: "2025-07-01", end: "2025-07-07" }),
      tag({ id: 2, name: "hytta" }),
      tag({ id: 3, name: "Roma" }),
    ]);
    expect(labels.get(1)).toMatch(/^Hytta \(.+2025.+\)$/);
    expect(labels.get(2)).toBe("hytta (uten datoer)");
    expect(labels.get(3)).toBe("Roma");
  });
});
