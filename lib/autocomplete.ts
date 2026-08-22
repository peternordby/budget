// Builds description suggestions out of the user's own transaction history.
// Choosing a suggestion prefills category, amount and tag, so a repeat purchase
// is one keystroke rather than four fields.

export type IndexableExpense = {
  item: string;
  price: number;
  category_id: number;
  tag: string | null;
  date: string | null;
};

export type ItemSuggestion = {
  item: string;
  categoryId: number;
  price: number;
  tag: string | null;
  lastDate: string;
  count: number;
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value);
}

function mostFrequentTag(tags: string[]) {
  if (!tags.length) return null;
  const counts = new Map<string, number>();
  tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));

  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, tag) => {
    if (count > bestCount) {
      best = tag;
      bestCount = count;
    }
  });
  return best;
}

export function buildItemIndex(expenses: IndexableExpense[]): ItemSuggestion[] {
  const groups = new Map<string, IndexableExpense[]>();

  expenses.forEach((expense) => {
    const key = expense.item.trim().toLowerCase();
    if (!key) return;
    const group = groups.get(key) ?? [];
    group.push(expense);
    groups.set(key, group);
  });

  const suggestions: ItemSuggestion[] = [];

  groups.forEach((group) => {
    // The most recent entry decides the display spelling and the category.
    const sorted = [...group].sort((a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "")
    );
    const latest = sorted[sorted.length - 1];
    const tags = group
      .map((entry) => entry.tag?.trim() ?? "")
      .filter((tag) => tag.length > 0);

    suggestions.push({
      item: latest.item.trim(),
      categoryId: latest.category_id,
      price: median(group.map((entry) => entry.price)),
      tag: mostFrequentTag(tags),
      lastDate: latest.date ?? "",
      count: group.length,
    });
  });

  return suggestions.sort(
    (a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate)
  );
}

export function suggestItems(
  index: ItemSuggestion[],
  query: string,
  limit = 6
): ItemSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const prefix: ItemSuggestion[] = [];
  const substring: ItemSuggestion[] = [];

  index.forEach((suggestion) => {
    const haystack = suggestion.item.toLowerCase();
    if (haystack.startsWith(needle)) {
      prefix.push(suggestion);
    } else if (haystack.includes(needle)) {
      substring.push(suggestion);
    }
  });

  return [...prefix, ...substring].slice(0, limit);
}
