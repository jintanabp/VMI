import { formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";

/**
 * คงเหลือแบบ "หีบ/เศษ" — stock_cover_day นับเป็นชิ้น จึงหารด้วย PackingSize
 * ทั้งสองตัวเลขขนาดเท่ากัน คั่นด้วย "/" ให้อ่านเป็นค่าเดียว
 * ล็อกความกว้างสองฝั่งเท่ากัน (3ch) เพื่อให้ "/" ตรงกันทุกแถว
 */
export function StockCaseCell({
  cases,
  remainder,
  pieces,
  packSize,
  compact = false,
}: {
  cases: number;
  remainder: number;
  pieces: number;
  packSize: number;
  compact?: boolean;
}) {
  const title =
    packSize > 1
      ? `${formatNumber(cases, 0)} หีบ ${formatNumber(remainder, 0)} ชิ้น · รวม ${formatNumber(pieces, 0)} ชิ้น (${formatNumber(packSize, 0)} ชิ้น/หีบ)`
      : `${formatNumber(cases, 0)} หีบ (ไม่มีข้อมูลชิ้น/หีบ)`;
  return (
    <span
      className={cn(
        "inline-flex items-baseline justify-end font-medium tabular-nums whitespace-nowrap text-slate-800 dark:text-slate-200",
        compact && "text-xs"
      )}
      title={title}
    >
      <span className="min-w-[3ch] text-right">{formatNumber(cases, 0)}</span>
      <span className="mx-px text-slate-300 dark:text-slate-600">/</span>
      <span className="min-w-[3ch] text-left">{formatNumber(remainder, 0)}</span>
    </span>
  );
}

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
