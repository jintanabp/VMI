"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
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
  orderedQty = 0,
  promoStepLot = null,
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
  /** จำนวนที่สั่งไปแล้วแต่ของยังไม่ถึงร้าน — ใช้เปลี่ยนคำบนชิปให้ตรงความจริง
   *  (suggestOrder ที่ส่งเข้ามาต้องหักตัวนี้ออกมาแล้ว) */
  orderedQty?: number;
  /**
   * ล็อตของโปรของแถม — จำนวนต้องเป็นทวีคูณของค่านี้ ไม่งั้นของแถมมีเศษ
   *
   * ตัวปรับจำนวนไม่บังคับเอง และผู้เรียกก็ไม่ปัดให้แล้ว (ปุ่ม +/− เดินทีละขั้นเฉย ๆ)
   * — การตัดสินว่าจะปัดขึ้นหรือตัดเศษอยู่ที่หน้าตรวจโปรตอนกด "ตรวจสอบคำสั่ง"
   * ที่นี่ใช้บอกผู้ใช้ว่าขั้นโปรของบรรทัดนี้ใหญ่เท่าไร
   */
  promoStepLot?: number | null;
}) {
  const btn = compact ? "h-6 w-6 rounded-md" : "h-8 w-8";
  const stepHint =
    promoStepLot && promoStepLot > 1
      ? `โปรแถมขั้นละ ${promoStepLot} หีบ — เศษที่ไม่ครบขั้นไม่ได้ของแถม ตอนกดตรวจสอบคำสั่งจะให้ยืนยันอีกครั้ง`
      : null;
  const defaultQty = suggestOrder > 0 ? suggestOrder : 0;
  // ปุ่ม ↺ ในบรรทัดกับชิป "แนะนำ" ทำหน้าที่ตรงข้ามกัน มีพร้อมกันไม่ได้
  const showReset = !showSuggestChip && qty !== defaultQty;
  const showChip = showSuggestChip && suggestOrder > 0 && qty !== suggestOrder;
  // สั่งครบตามที่แนะนำแล้ว — บอกให้รู้ ไม่ใช่เงียบไปเฉย ๆ จนคนสงสัยว่าทำไมไม่มีชิป
  const showOrdered = showSuggestChip && suggestOrder <= 0 && orderedQty > 0;
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
        title={stepHint ? `ลดลงหนึ่งขั้นโปร (${promoStepLot} หีบ)` : "ลด 1 หีบ"}
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
            compact ? "h-6 w-11 text-xs" : "h-8 w-[4.5rem] text-sm"
          )}
          title={[
            suggestOrder > 0 && qty !== suggestOrder
              ? `แนะนำ ${suggestOrder} หีบ`
              : "พิมพ์จำนวนหีบ",
            stepHint,
          ]
            .filter(Boolean)
            .join(" · ")}
          aria-label="จำนวนสั่ง"
        />
      ) : (
        <span
          className={cn(
            "text-center font-bold tabular-nums text-slate-900 dark:text-white",
            compact ? "min-w-[1.5rem] text-xs" : "w-8 text-sm"
          )}
          title={
            [
              suggestOrder > 0 && qty !== suggestOrder
                ? `แนะนำ ${suggestOrder} หีบ`
                : null,
              stepHint,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
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
        title={stepHint ? `เพิ่มขึ้นหนึ่งขั้นโปร (${promoStepLot} หีบ)` : "เพิ่ม 1 หีบ"}
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
          title={
            orderedQty > 0
              ? `สั่งไปแล้ว ${orderedQty} หีบ (ของยังไม่ถึงร้าน) — ระบบแนะนำเพิ่มอีก ${suggestOrder} หีบ กดเพื่อใส่จำนวนนี้`
              : `ระบบแนะนำ ${suggestOrder} หีบ — กดเพื่อใส่จำนวนนี้`
          }
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-px text-[10px] font-semibold leading-tight text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
        >
          <RotateCcw className="h-2.5 w-2.5 shrink-0" />
          {orderedQty > 0 ? `แนะนำอีก ${suggestOrder}` : `แนะนำ ${suggestOrder}`}
        </button>
      )}
      {showOrdered && (
        <span
          title={`สั่งไปแล้ว ${orderedQty} หีบ ครบตามที่ระบบแนะนำ — ของยังไม่ถึงร้าน สั่งเพิ่มได้ถ้าต้องการ`}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-px text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400"
        >
          <Check className="h-2.5 w-2.5 shrink-0" />
          สั่งครบแล้ว
        </span>
      )}
    </div>
  );
}
