import { supabase } from "@/lib/supabaseClient";
import { encField, isPlaintext } from "@/lib/crypto";

// The one-time pass that encrypts rows written before encryption existed.
//
// Deliberately a button the owner presses rather than anything automatic: it
// rewrites every row in the account, and that should happen when someone is
// watching. It is safe to interrupt and safe to run twice — rows that already
// carry the `gc:` marker are skipped, and lib/crypto.ts reads plaintext and
// ciphertext side by side, so a half-finished pass is a working ledger.

/** Column names to encrypt, per table. Everything else stays readable: dates,
 *  category names and kinds, `savings_snapshot.category` (it is inside a unique
 *  constraint), and the foreign keys. */
const TARGETS = [
  { table: "expense", columns: ["item", "price", "tag"] },
  { table: "recurring_expense", columns: ["item", "price", "tag"] },
  { table: "budget", columns: ["budget"] },
  { table: "savings_snapshot", columns: ["amount"] },
] as const;

// Updates go out in batches rather than one at a time (thousands of sequential
// round trips) and rather than all at once (thousands of concurrent ones).
const BATCH = 25;

export type ReencryptProgress = { scanned: number; updated: number };

export async function reencryptAll(
  userId: string,
  onProgress?: (progress: ReencryptProgress) => void
): Promise<ReencryptProgress> {
  let scanned = 0;
  let updated = 0;

  for (const { table, columns } of TARGETS) {
    const { data, error } = await supabase
      .from(table)
      .select(["id", ...columns].join(", "))
      .eq("user_id", userId);

    if (error) throw new Error(`${table}: ${error.message}`);

    const rows = (data ?? []) as any[];
    scanned += rows.length;

    const stale = rows.filter((row) =>
      columns.some((column) => row[column] !== null && isPlaintext(row[column]))
    );

    for (let index = 0; index < stale.length; index += BATCH) {
      const slice = stale.slice(index, index + BATCH);
      const results = await Promise.all(
        slice.map(async (row) => {
          const patch: Record<string, string | null> = {};
          for (const column of columns) {
            // Already-encrypted columns are left exactly as they are, so a
            // second run cannot double-encrypt what the first one finished.
            if (row[column] !== null && isPlaintext(row[column])) {
              patch[column] = await encField(String(row[column]));
            }
          }
          return supabase
            .from(table)
            .update(patch)
            .eq("id", row.id)
            .eq("user_id", userId);
        })
      );

      const failure = results.find((result) => result.error);
      if (failure?.error) throw new Error(`${table}: ${failure.error.message}`);

      updated += slice.length;
      onProgress?.({ scanned, updated });
    }
  }

  return { scanned, updated };
}

/** Whether anything is still stored in the clear, so the button can hide once
 *  there is nothing left to do. Counts rather than fetches everything twice:
 *  the pass itself re-reads what it needs. */
export async function countPlaintext(userId: string) {
  let remaining = 0;
  for (const { table, columns } of TARGETS) {
    const { data, error } = await supabase
      .from(table)
      .select(["id", ...columns].join(", "))
      .eq("user_id", userId);
    if (error) throw new Error(`${table}: ${error.message}`);
    remaining += ((data ?? []) as any[]).filter((row) =>
      columns.some((column) => row[column] !== null && isPlaintext(row[column]))
    ).length;
  }
  return remaining;
}
