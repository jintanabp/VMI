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
}: {
  qty: number;
  suggestOrder: number;
  onMinus: () => void;
  onPlus: () => void;
  onSetQty?: (qty: number) => void;
  onApplySuggest?: () => void;
  compact?: boolean;
}) {
  const btn = compact ? "h-6 w-6 rounded-md" : "h-8 w-8";
  const defaultQty = suggestOrder > 0 ? suggestOrder : 0;
  const showReset = qty !== defaultQty;
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
      className="inline-flex items-center justify-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
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
  );
}
