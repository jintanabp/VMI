"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";

interface StorePriceInputProps {
  /** ราคาที่ร้านแก้เอง (null = ยังไม่แก้) */
  value: number | null;
  /** ราคา/หีบ จากระบบ (C4 + ราคาเงินสดจาก SKU master) */
  c4UnitPrice: number | null;
  expired?: boolean;
  mismatch?: boolean;
  /** override − ราคาระบบ */
  diff?: number | null;
  onChange: (price: number | null) => void;
  compact?: boolean;
}

/**
 * ช่องแก้ "ราคา/หีบ" ในหน้าตรวจสอบคำสั่ง
 *
 * ทำตามแบบเดียวกับ StockQtyStepper: เก็บ draft เป็น string, commit ตอน blur,
 * ค่าผิดย้อนกลับค่าเดิม — ไม่ commit ระหว่างพิมพ์ ไม่งั้นพิมพ์ "1" ของ "1200"
 * จะกลายเป็นราคา 1 บาททันที
 */
export function StorePriceInput({
  value,
  c4UnitPrice,
  expired = false,
  mismatch = false,
  diff = null,
  onChange,
  compact = false,
}: StorePriceInputProps) {
  const displayed = value ?? c4UnitPrice;
  const [draft, setDraft] = useState(displayed == null ? "" : String(displayed));

  useEffect(() => {
    setDraft(displayed == null ? "" : String(displayed));
  }, [displayed]);

  function commitDraft() {
    const text = draft.trim().replace(/,/g, "");
    if (text === "") {
      onChange(null); // ว่าง = กลับไปใช้ราคาระบบ
      return;
    }
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      setDraft(displayed == null ? "" : String(displayed));
      return;
    }
    onChange(Math.round(n * 100) / 100);
  }

  const hasOverride = value != null;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        {hasOverride && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 text-slate-400 hover:text-teal-600"
            onClick={() => onChange(null)}
            title={
              c4UnitPrice != null
                ? `กลับเป็นราคาระบบ ${formatNumber(c4UnitPrice, 2)}`
                : "ล้างราคาที่กรอก"
            }
            aria-label="กลับเป็นราคาระบบ"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder={c4UnitPrice == null ? "ไม่มีราคาระบบ" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={cn(
            "rounded-md border bg-white px-1.5 text-right font-semibold tabular-nums outline-none focus:ring-2 dark:bg-slate-900",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none",
            compact ? "h-7 w-[5rem] text-xs" : "h-8 w-[5.5rem] text-sm",
            mismatch
              ? "border-amber-400 text-amber-800 ring-amber-500/30 dark:border-amber-600 dark:text-amber-300"
              : "border-slate-200 text-slate-900 ring-teal-500/30 dark:border-slate-600 dark:text-white",
            expired && !mismatch && "text-amber-700 dark:text-amber-400"
          )}
          title={
            c4UnitPrice != null
              ? `ราคาระบบ ${formatNumber(c4UnitPrice, 2)} บาท/หีบ — แก้ได้ ปล่อยว่างเพื่อกลับค่าเดิม`
              : "ระบบไม่มีราคาอ้างอิงสำหรับสินค้านี้"
          }
          aria-label="ราคาต่อหีบ"
        />
      </div>

      {mismatch && diff != null && (
        <span
          className="flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
          title={`ราคาระบบ (C4) ${formatNumber(c4UnitPrice ?? 0, 2)} · ร้านกรอก ${formatNumber(value ?? 0, 2)}`}
        >
          <AlertTriangle className="h-3 w-3" />
          ต่างจากระบบ {diff > 0 ? "+" : ""}
          {formatNumber(diff, 2)}
        </span>
      )}
      {mismatch && diff == null && (
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          ระบบไม่มีราคาอ้างอิง
        </span>
      )}
    </div>
  );
}
