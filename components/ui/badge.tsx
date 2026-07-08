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
}: {
  flag: CvdFlag;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold",
        compact ? "px-1.5 py-0.5 text-[10px] leading-tight" : "px-2.5 py-1 text-xs",
        flagStyles[flag]
      )}
    >
      {flagLabels[flag]}
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
