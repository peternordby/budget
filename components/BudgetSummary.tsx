import { formatCurrency } from "@/lib/format";

type BudgetSummaryProps = {
  spentTotal: number;
  budgetTotal: number;
  percentUsed: number;
  label?: string;
  emptyLabel?: string;
};

export default function BudgetSummary({
  spentTotal,
  budgetTotal,
  percentUsed,
  label = "Budsjett",
  emptyLabel = "Ingen budsjett"
}: BudgetSummaryProps) {
  const clampedPercent = Math.min(percentUsed, 100);
  const isOver = percentUsed > 100;

  return (
    <section className="card" aria-label={label}>
      <div className="budget-summary">
        <div className="budget-summary-row">
          <span>
            Brukt {formatCurrency(spentTotal)} av {formatCurrency(budgetTotal)}
          </span>
          <span className={isOver ? "text-expense" : "helper"}>
            {budgetTotal > 0 ? `${percentUsed.toFixed(0)}%` : emptyLabel}
          </span>
        </div>
        <div className="budget-progress-track">
          <div
            className={`budget-progress-fill ${isOver ? "over" : ""}`}
            style={{ width: `${clampedPercent}%` }}
          />
        </div>
      </div>
    </section>
  );
}
