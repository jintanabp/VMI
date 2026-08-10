"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoticeTone = "danger" | "warn" | "info";

const TONE: Record<NoticeTone, string> = {
  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200",
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200",
};

/**
 * แบนเนอร์เตือนที่มีเพดานในตัว
 *
 * เดิมแต่ละหน้าเขียนแบนเนอร์เองแล้ว map ลิสต์ออกมาทั้งหมดโดยไม่จำกัด ผลคือออเดอร์
 * ที่มีปัญหา 20-30 รายการจะได้แบนเนอร์สูงหลายร้อย px แล้วดันตารางที่อยู่ข้างล่าง
 * (ซึ่งเป็นตัวเดียวที่ flex-1) จนยุบเกือบเป็นศูนย์ — เห็นคำเตือนแต่แก้อะไรไม่ได้
 *
 * ตัวนี้ยุบลิสต์ไว้ก่อนเมื่อยาวเกิน collapseAfter แล้วให้กดกาง ซึ่งตอนกางก็ยัง
 * เลื่อนอยู่ในตัวเอง ไม่ไปแย่งความสูงของตาราง
 */
export function NoticeBanner({
  tone = "warn",
  icon,
  title,
  items,
  footer,
  collapseAfter = 3,
  className,
}: {
  tone?: NoticeTone;
  icon?: ReactNode;
  /** บรรทัดสรุป — ต้องบอกจำนวนและความรุนแรงให้ครบ เพราะลิสต์อาจถูกยุบไว้ */
  title: ReactNode;
  items?: { key: string; node: ReactNode }[];
  footer?: ReactNode;
  collapseAfter?: number;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const list = items ?? [];
  const collapsible = list.length > collapseAfter;
  const visible = collapsible && !showAll ? list.slice(0, collapseAfter) : list;

  return (
    <div
      className={cn(
        "shrink-0 rounded-xl border px-4 py-3 text-sm",
        TONE[tone],
        className
      )}
    >
      <p className="flex items-start gap-1.5 font-semibold">
        <span className="mt-0.5 shrink-0">
          {icon ?? <AlertTriangle className="h-4 w-4" />}
        </span>
        <span className="min-w-0">{title}</span>
      </p>

      {visible.length > 0 && (
        <ul
          className={cn(
            "mt-1 space-y-0.5 text-xs",
            showAll && "vmi-scroll max-h-32 overflow-y-auto overscroll-contain"
          )}
        >
          {visible.map((item) => (
            <li key={item.key} className="min-w-0">
              {item.node}
            </li>
          ))}
        </ul>
      )}

      {collapsible && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 text-xs font-semibold underline underline-offset-2"
        >
          {showAll ? "ย่อ" : `ดูทั้งหมด ${list.length} รายการ`}
        </button>
      )}

      {footer && <div className="mt-1.5 text-xs">{footer}</div>}
    </div>
  );
}
