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
      {/* ตัวคั่นต้องอ่านออกว่าเป็น "/" ไม่งั้น "12 0" ดูเหมือนเลข 120
          — เดิม slate-300/mx-px จางจนแทบมองไม่เห็น */}
      <span className="mx-1 font-semibold text-slate-500 dark:text-slate-400">
        /
      </span>
      <span className="min-w-[3ch] text-left">{formatNumber(remainder, 0)}</span>
    </span>
  );
}

/**
 * ขายเฉลี่ยต่อวัน — หน่วยหีบอ่านยากมากเมื่อสินค้าขายช้า (0.0 หีบ/วัน ไม่บอกอะไรเลย)
 * จึงกำกับหน่วยชิ้นไว้ใต้ตัวเลขเสมอเมื่อรู้ค่า ชิ้น/หีบ
 */
export function StockAvgSalesCell({
  avgCases,
  packSize,
  compact = false,
  inline = false,
}: {
  avgCases: number;
  packSize: number;
  compact?: boolean;
  /** true = วางชิ้นต่อท้ายในบรรทัดเดียว (การ์ดมือถือ), false = ซ้อนใต้ตัวเลข (ตาราง) */
  inline?: boolean;
}) {
  const hasPack = packSize > 1;
  const avgPieces = avgCases * packSize;
  // ขายช้ามากจนปัดเป็น 0.0 — โชว์ทศนิยมเพิ่มแทนที่จะแสดง 0 เฉย ๆ
  const piecesDecimals = avgPieces > 0 && avgPieces < 0.1 ? 2 : 1;
  const casesText = formatNumber(
    avgCases,
    avgCases > 0 && avgCases < 0.1 ? 2 : 1
  );
  const piecesText = formatNumber(avgPieces, piecesDecimals);

  return (
    <span
      className={cn(
        "inline-flex tabular-nums",
        inline
          ? "items-baseline gap-1"
          : "flex-col items-end leading-tight",
        compact && "text-xs"
      )}
      title={
        hasPack
          ? `ขายเฉลี่ย ${formatNumber(avgCases, 2)} หีบ/วัน = ${piecesText} ชิ้น/วัน (${formatNumber(packSize, 0)} ชิ้น/หีบ)`
          : `ขายเฉลี่ย ${formatNumber(avgCases, 2)} หีบ/วัน (ไม่มีข้อมูลชิ้น/หีบ)`
      }
    >
      <span
        className={cn(
          "text-slate-800 dark:text-slate-200",
          inline && "font-semibold text-slate-900 dark:text-slate-100"
        )}
      >
        {casesText}
      </span>
      {hasPack && (
        <span
          className={cn(
            "font-normal text-slate-400 dark:text-slate-500",
            "vmi-t-xs"
          )}
        >
          {inline ? `(${piecesText} ชิ้น)` : `${piecesText} ชิ้น`}
        </span>
      )}
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
