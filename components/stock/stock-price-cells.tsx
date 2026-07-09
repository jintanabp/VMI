import { formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";

export function StockListPriceCell({
  unitPrice,
  expired,
  compact = false,
}: {
  unitPrice?: number | null;
  expired?: boolean;
  compact?: boolean;
}) {
  if (unitPrice == null) return <span className="text-slate-400">-</span>;
  return (
    <span
      className={cn(
        "font-medium text-slate-800 dark:text-slate-200",
        expired && "text-amber-600 dark:text-amber-400",
        compact && "text-xs"
      )}
      title={expired ? "ราคาในระบบหมดอายุ" : undefined}
    >
      {formatNumber(unitPrice, 0)}
    </span>
  );
}

export function StockDiscountPerCaseCell({
  discountBaht,
  discountPct,
  compact = false,
}: {
  discountBaht?: number | null;
  discountPct?: number | null;
  compact?: boolean;
}) {
  if (discountBaht != null && discountBaht > 0) {
    return (
      <span className={cn("text-slate-600 dark:text-slate-400", compact && "text-xs")}>
        {formatNumber(discountBaht, 2)}
      </span>
    );
  }
  if (discountPct != null && discountPct > 0) {
    return (
      <span className={cn("text-slate-600 dark:text-slate-400", compact && "text-xs")}>
        {formatNumber(discountPct, 1)}%
      </span>
    );
  }
  return <span className="text-slate-300 dark:text-slate-600">—</span>;
}

export function StockNetPriceCell({
  unitPrice,
  netUnitPrice,
  expired,
  compact = false,
}: {
  unitPrice?: number | null;
  netUnitPrice?: number | null;
  expired?: boolean;
  compact?: boolean;
}) {
  if (unitPrice == null) return <span className="text-slate-400">-</span>;
  const net = netUnitPrice ?? unitPrice;
  const hasDiscount = net < unitPrice - 0.001;
  return (
    <span
      className={cn(
        hasDiscount
          ? "font-semibold text-slate-900 dark:text-slate-100"
          : "text-slate-700 dark:text-slate-300",
        expired && !hasDiscount && "text-amber-600 dark:text-amber-400",
        compact && "text-xs"
      )}
      title={expired ? "ราคาในระบบหมดอายุ" : undefined}
    >
      {formatNumber(net, 0)}
    </span>
  );
}
