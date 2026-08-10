"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** ตัวปรับจำนวนสั่ง (หีบ) — ใช้ทั้งตารางสต็อก การ์ดมือถือ และมุมมองโปรโมชั่น */
export function StockQtyStepper({
  qty,
  suggestOrder,
  onMinus,
  onPlus,
  onSetQty,
  onApplySuggest,
  compact = false,
  showSuggestChip = false,
}: {
  qty: number;
  suggestOrder: number;
  onMinus: () => void;
  onPlus: () => void;
  onSetQty?: (qty: number) => void;
  /**
   * ความหมายขึ้นกับ showSuggestChip — ผู้เรียกต้องส่งให้ตรงกัน:
   *   showSuggestChip = false → "ล้างจำนวนที่ปรับ" (ปุ่ม ↺ ในบรรทัด)
   *   showSuggestChip = true  → "เติมจำนวนแนะนำ" (ชิปใต้ช่อง)
   * ถ้าสลับผิด ชิป "แนะนำ N" จะกลายเป็นปุ่มล้างเป็น 0 แทน
   */
  onApplySuggest?: () => void;
  compact?: boolean;
  /** โชว์จำนวนแนะนำเป็นชิปใต้ช่อง — ใช้ฝั่ง /stock ที่ช่องเริ่มต้นเป็น 0 ทุกแถว */
  showSuggestChip?: boolean;
}) {
  const btn = compact ? "h-6 w-6 rounded-md" : "h-8 w-8";
  const defaultQty = suggestOrder > 0 ? suggestOrder : 0;
  // ปุ่ม ↺ ในบรรทัดกับชิป "แนะนำ" ทำหน้าที่ตรงข้ามกัน มีพร้อมกันไม่ได้
  const showReset = !showSuggestChip && qty !== defaultQty;
  const showChip = showSuggestChip && suggestOrder > 0 && qty !== suggestOrder;
  const [draft, setDraft] = useState(String(qty));

  useEffect(() => {
    setDraft(String(qty));
  }, [qty]);

  function commitDraft() {
    if (!onSetQty) return;
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < 0) {
      setDraft(String(qty));
      return;
    }
    onSetQty(n);
  }

  return (
    <div
      className="inline-flex flex-col items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="inline-flex items-center justify-center gap-0.5">
      {showReset && onApplySuggest && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApplySuggest();
          }}
          title={
            suggestOrder > 0
              ? `กลับเป็นจำนวนแนะนำ ${suggestOrder}`
              : "ล้างจำนวนที่ปรับ"
          }
          className="rounded p-0.5 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
        >
          <RotateCcw className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      )}
      <Button
        size="icon"
        variant="outline"
        className={btn}
        onClick={(e) => {
          e.stopPropagation();
          onMinus();
        }}
        disabled={qty <= 0}
        aria-label="ลดจำนวน"
      >
        <Minus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </Button>
      {onSetQty ? (
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "rounded-md border border-slate-200 bg-white px-0.5 text-center font-bold tabular-nums text-slate-900 outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none",
            compact ? "h-6 w-14 text-xs" : "h-8 w-[4.5rem] text-sm"
          )}
          title={
            suggestOrder > 0 && qty !== suggestOrder
              ? `แนะนำ ${suggestOrder} หีบ`
              : "พิมพ์จำนวนหีบ"
          }
          aria-label="จำนวนสั่ง"
        />
      ) : (
        <span
          className={cn(
            "text-center font-bold tabular-nums text-slate-900 dark:text-white",
            compact ? "min-w-[1.5rem] text-xs" : "w-8 text-sm"
          )}
          title={
            suggestOrder > 0 && qty !== suggestOrder
              ? `แนะนำ ${suggestOrder} หีบ`
              : undefined
          }
        >
          {qty}
        </span>
      )}
      <Button
        size="icon"
        variant="outline"
        className={btn}
        onClick={(e) => {
          e.stopPropagation();
          onPlus();
        }}
        aria-label="เพิ่มจำนวน"
      >
        <Plus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </Button>
      </div>
      {/* จำนวนที่ระบบแนะนำ — อยู่ใต้ช่องเพื่อไม่ให้แย่งความหมายกับ "จำนวนที่จะสั่งจริง"
          หายไปเองเมื่อจำนวนตรงกับคำแนะนำแล้ว (เป็นทั้ง feedback และคุมความสูงคอลัมน์) */}
      {showChip && onApplySuggest && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApplySuggest();
          }}
          title={`ระบบแนะนำ ${suggestOrder} หีบ — กดเพื่อใส่จำนวนนี้`}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-px text-[10px] font-semibold leading-tight text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
        >
          <RotateCcw className="h-2.5 w-2.5 shrink-0" />
          แนะนำ {suggestOrder}
        </button>
      )}
    </div>
  );
}
