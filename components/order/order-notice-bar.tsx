"use client";

import { useRef, useState, type ReactNode } from "react";
import { ListFilter, X } from "lucide-react";
import { AnchoredPanel, PanelHeader } from "@/components/ui/anchored-panel";
import { NOTICE_TONE, type NoticeTone } from "@/components/ui/notice-banner";
import { cn } from "@/lib/utils";

export interface OrderNoticeGroup {
  key: string;
  tone: NoticeTone;
  icon: ReactNode;
  /** ข้อความบนชิป — สั้นที่สุดที่ยังบอกได้ว่าเรื่องอะไร */
  label: string;
  count: number;
  /** สรุปเต็มบรรทัดเดียว ใช้เป็น tooltip ของชิปและหัวข้อในแผงกาง */
  summary: string;
  /** SKU ที่เข้าข่ายคำเตือนนี้ — ใช้กรองตาราง */
  skuCodes: string[];
  items: { key: string; node: ReactNode }[];
  footer?: ReactNode;
}

/**
 * แถบคำเตือนของหน้าตรวจสอบคำสั่ง — หนึ่งบรรทัด สูงคงที่ไม่ว่าจะเตือนกี่รายการ
 *
 * เดิมเป็นกองแบนเนอร์เรียงลงมา ซึ่งกินความสูงตามจำนวนรายการที่มีปัญหา ที่ ≥1024px
 * หน้านี้ล็อกเป็น 100dvh + overflow:hidden และตารางเป็นลูกตัวเดียวที่ flex-1
 * ความสูงที่แบนเนอร์กินไปจึงถูกหักจากตารางตรง ๆ โดยไม่มี page scroll ให้กู้คืน
 * ยิ่งมีเรื่องต้องแก้เยอะ ที่สำหรับแก้ยิ่งเหลือน้อย
 *
 * ที่นี่ยุบเหลือชิปนับจำนวน แล้วย้ายสองอย่างออกจากสายเลย์เอาต์:
 *   - รายการเต็มไปอยู่ใน AnchoredPanel (portal) จึงไม่กินความสูงของหน้า
 *   - การลงมือแก้ไปอยู่ที่ตัวตาราง — กดชิปแล้วตารางเหลือเฉพาะรายการนั้น
 */
export function OrderNoticeBar({
  groups,
  activeKey,
  onToggle,
  visibleCount,
  totalCount,
}: {
  groups: OrderNoticeGroup[];
  activeKey: string | null;
  onToggle: (key: string | null) => void;
  visibleCount: number;
  totalCount: number;
}) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  if (groups.length === 0) return null;

  const filtering = activeKey != null;

  return (
    <div
      ref={barRef}
      className="vmi-order-notice-bar mb-2 flex shrink-0 items-center gap-1.5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {groups.map((g) => {
          const active = g.key === activeKey;
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={active}
              title={`${g.summary} — กดเพื่อดูเฉพาะรายการเหล่านี้ในตาราง`}
              onClick={() => onToggle(active ? null : g.key)}
              className={cn(
                "inline-flex min-w-0 shrink items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-shadow",
                NOTICE_TONE[g.tone],
                active &&
                  "ring-2 ring-current ring-offset-1 dark:ring-offset-slate-950"
              )}
            >
              <span className="shrink-0">{g.icon}</span>
              {/* จอแคบเหลือแค่ไอคอน+ตัวเลข — ชิปทุกอันต้องอยู่ในแถวเดียวเสมอ */}
              <span className="hidden truncate sm:inline">{g.label}</span>
              <span className="shrink-0 tabular-nums">{g.count}</span>
            </button>
          );
        })}
      </div>

      {filtering && (
        <button
          type="button"
          onClick={() => onToggle(null)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">
            {visibleCount}/{totalCount}
          </span>
          <span className="hidden whitespace-nowrap sm:inline">ล้างตัวกรอง</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="ดูรายละเอียดคำเตือนทั้งหมด"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <ListFilter className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">รายละเอียด</span>
      </button>

      <AnchoredPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={barRef}
        width={560}
        reflowKey={groups.length}
      >
        <PanelHeader
          title="รายการที่ควรตรวจสอบ"
          onClose={() => setOpen(false)}
        />
        <div className="vmi-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {groups.map((g) => (
            <section key={g.key} className="mb-3 last:mb-0">
              <p className="mb-1 flex items-start gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <span className="mt-0.5 shrink-0">{g.icon}</span>
                <span className="min-w-0">{g.summary}</span>
              </p>
              {g.items.length > 0 && (
                <ul className="space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
                  {g.items.map((item) => (
                    <li key={item.key} className="min-w-0">
                      {item.node}
                    </li>
                  ))}
                </ul>
              )}
              {g.footer && (
                <div className="mt-1 pl-5 text-xs">{g.footer}</div>
              )}
            </section>
          ))}
        </div>
      </AnchoredPanel>
    </div>
  );
}
