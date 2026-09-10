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
  stockValue,
  compact = false,
}: {
  cases: number;
  remainder: number;
  pieces: number;
  packSize: number;
  /** มูลค่าของที่ค้างอยู่ (บาท) — null = ไม่รู้ต้นทุนและไม่รู้ราคาขาย */
  stockValue?: number | null;
  compact?: boolean;
}) {
  const base =
    packSize > 1
      ? `${formatNumber(cases, 0)} หีบ ${formatNumber(remainder, 0)} ชิ้น · รวม ${formatNumber(pieces, 0)} ชิ้น (${formatNumber(packSize, 0)} ชิ้น/หีบ)`
      : `${formatNumber(cases, 0)} หีบ (ไม่มีข้อมูลชิ้น/หีบ)`;
  /**
   * มูลค่าเงินที่จมอยู่กับของกองนี้ — ตัวเลขนี้มีอยู่แล้วทั้งใน "มูลค่ารวม" บนหัวจอ
   * และคอลัมน์ "มูลค่าคงเหลือ" ในไฟล์ Excel ขาดแค่บนตารางที่ใช้ตัดสินใจ
   *
   * ในแท็บ "ค้างสต็อก" ของ vda1 ตัวหนักสุด 2,970 บาท ตัวเบาสุดหลักสิบ — ต่างกัน 100 เท่า
   * โดยที่บนจอเดิมดูเหมือนกันหมด จึงเรียงลำดับความสำคัญไม่ได้เลย
   */
  const showValue = stockValue != null && stockValue > 0;
  const title = showValue
    ? `${base} · มูลค่า ${formatNumber(stockValue, 0)} บาท`
    : base;
  const line = (
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

  if (!showValue) return line;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      {line}
      <span className="font-normal text-slate-400 vmi-t-xs dark:text-slate-500">
        {formatNumber(stockValue, 0)} ฿
      </span>
    </span>
  );
}

/**
 * ขายเฉลี่ยต่อวัน — หน่วยหีบอ่านยากมากเมื่อสินค้าขายช้า (0.0 หีบ/วัน ไม่บอกอะไรเลย)
 * จึงกำกับหน่วยชิ้นไว้ใต้ตัวเลขเสมอเมื่อรู้ค่า ชิ้น/หีบ
 */
export function StockAvgSalesCell({
  avgCases,
  avg30Cases,
  packSize,
  compact = false,
  inline = false,
}: {
  avgCases: number;
  /** ขายเฉลี่ยฐาน 30 วัน — ใช้เฉพาะตอน 7 วันเป็น 0 (ดู fallback30 ข้างล่าง) */
  avg30Cases?: number;
  packSize: number;
  compact?: boolean;
  /** true = วางชิ้นต่อท้ายในบรรทัดเดียว (การ์ดมือถือ), false = ซ้อนใต้ตัวเลข (ตาราง) */
  inline?: boolean;
}) {
  const hasPack = packSize > 1;
  const avgPieces = avgCases * packSize;
  /**
   * 7 วันล่าสุดไม่ขาย แต่ 30 วันยังมี — บรรทัดล่างเดิมจะเป็น "0.0 ชิ้น" ซึ่งไม่บอกอะไร
   * และทำให้เข้าใจว่าสินค้าตัวนี้ตายแล้ว แล้วสงสัยว่าทำไมปุ่ม "ซ่อนของไม่ขาย 1 เดือน"
   * ไม่เอามันออก (ปุ่มนั้นตัดสินด้วยยอด 30 วัน ไม่ใช่ 7 วันที่คอลัมน์นี้แสดง)
   *
   * จึงเอาค่า 30 วันมาแทนที่บรรทัดชิ้นเฉพาะเคสนี้ — เป็นค่าเดียวกับที่ CVD/MIN-MAX
   * ใช้คิดอยู่แล้ว และกินความกว้างไม่เกินข้อความ "0.03 ชิ้น" ที่เคยอยู่ตรงนั้น
   */
  const fallback30 = avgCases <= 0 && (avg30Cases ?? 0) > 0 ? avg30Cases! : null;
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
        fallback30 != null
          ? `7 วันล่าสุดไม่มีขาย · 30 วันเฉลี่ย ${formatNumber(fallback30, 2)} หีบ/วัน — ยังไม่นับว่า “ไม่ขาย 1 เดือน” ปุ่มซ่อนจึงไม่เอาออก`
          : hasPack
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
      {(fallback30 != null || hasPack) && (
        <span
          className={cn(
            "font-normal text-slate-400 dark:text-slate-500",
            "vmi-t-xs"
          )}
        >
          {fallback30 != null
            ? // การ์ดมือถือวางต่อท้ายบรรทัดเดียวกัน จึงต้องมีวงเล็บเหมือนหน่วยชิ้นที่มันมาแทน
              inline
              ? `(30ว. ${formatNumber(fallback30, 2)})`
              : `30ว. ${formatNumber(fallback30, 2)}`
            : inline
              ? `(${piecesText} ชิ้น)`
              : `${piecesText} ชิ้น`}
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
  pending,
  compact = false,
}: {
  discountBaht?: number | null;
  discountPct?: number | null;
  /** ส่วนลดของขั้นที่ยังไม่ถึง — โชว์จาง ๆ ว่ารออะไรอยู่ ไม่ใช่ส่วนลดที่ได้แล้ว */
  pending?: { minQty: number; discBaht: number | null; discPct: number | null } | null;
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
  if (pending && (pending.discBaht ?? pending.discPct)) {
    const amount =
      pending.discBaht != null && pending.discBaht > 0
        ? formatNumber(pending.discBaht, 2)
        : `${formatNumber(pending.discPct ?? 0, 1)}%`;
    return (
      <span
        className="inline-flex flex-col items-end leading-tight text-slate-400 dark:text-slate-500"
        title={`ยังไม่ได้ส่วนลด — สั่งอย่างน้อย ${formatNumber(pending.minQty, 0)} หีบ จึงจะได้ ${amount} ต่อหีบ`}
      >
        <span className={cn(compact && "text-xs")}>{amount}</span>
        <span className="vmi-t-xs">ซื้อ {formatNumber(pending.minQty, 0)} หีบ</span>
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
