import { cn } from "@/lib/utils";
import type { CvdFlag } from "@/lib/calculations";

const flagStyles: Record<CvdFlag, string> = {
  green:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800",
  yellow:
    "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800",
};

const flagLabels: Record<CvdFlag, string> = {
  green: "เหมาะสม",
  yellow: "ตรวจสอบ",
  red: "ไม่แนะนำ",
};

export function FlagBadge({
  flag,
  compact = false,
  dotOnly = false,
  className,
}: {
  flag: CvdFlag;
  compact?: boolean;
  /** จุดสีอย่างเดียว — เหมาะกับคอลัมน์แคบ */
  dotOnly?: boolean;
  className?: string;
}) {
  if (dotOnly) {
    const dotColors: Record<CvdFlag, string> = {
      green: "bg-emerald-500",
      yellow: "bg-amber-500",
      red: "bg-red-500",
    };
    /**
     * มีสัญลักษณ์ในจุดด้วย ไม่ใช่สีล้วน
     *
     * ป้ายเต็มที่มีข้อความโผล่เฉพาะจอ ≥1280px ต่ำกว่านั้นเหลือจุดสีอย่างเดียว —
     * คนตาบอดสี (ชาย ~8%) แยกเขียว/แดงไม่ออก และคอลัมน์นี้คือตัวชี้ว่าจำนวนที่สั่ง
     * เหมาะสมหรือไม่ · ใส่รูปทรงเข้าไปด้วยกินที่เพิ่มไม่กี่พิกเซล
     */
    const dotGlyphs: Record<CvdFlag, string> = {
      green: "✓",
      yellow: "!",
      red: "✕",
    };
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white",
          compact ? "h-3 w-3 text-[7px]" : "h-3.5 w-3.5 text-[8px]",
          dotColors[flag],
          className
        )}
        title={flagLabels[flag]}
        aria-label={flagLabels[flag]}
      >
        {dotGlyphs[flag]}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        compact ? "px-1.5 py-0.5 vmi-t-xs leading-tight" : "px-2.5 py-1 text-xs",
        flagStyles[flag],
        className
      )}
    >
      {flagLabels[flag]}
    </span>
  );
}

/**
 * ราคา/หีบ บนบรรทัดไม่ตรงกับที่ C4 คำนวณ — เซลล์ต้องเห็นก่อนอนุมัติ
 *
 * ไม่ระบุว่าใครเป็นคนตั้ง เพราะเซลล์ที่แก้ราคาในหน้าตรวจออเดอร์เองก็ทำให้ธงนี้ขึ้นได้
 */
export function PriceFlagBadge({
  reason,
  title,
  compact = false,
  className,
}: {
  reason?: string | null;
  title?: string;
  compact?: boolean;
  className?: string;
}) {
  const label =
    reason === "no_baseline"
      ? "ไม่มีราคาระบบ"
      : reason === "unverified"
        ? "ยืนยันราคาไม่ได้"
        : "ราคาต่างระบบ";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full font-semibold",
        compact
          ? "px-1.5 py-0.5 vmi-t-xs leading-tight"
          : "px-2.5 py-1 text-xs",
        flagStyles.yellow,
        className
      )}
      title={title ?? label}
    >
      ⚠ {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_approval:
      "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",
    approved:
      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800",
    rejected:
      "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800",
  };
  const labels: Record<string, string> = {
    pending_approval: "รออนุมัติ",
    approved: "อนุมัติแล้ว",
    rejected: "ปฏิเสธ",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[status] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
