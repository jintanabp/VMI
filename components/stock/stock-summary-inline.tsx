"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Clock,
  Package,
  RefreshCw,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDays, formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";

/**
 * แถบสรุปเหนือตาราง — หนึ่งแถว สูง ~56px (เดิมเป็นการ์ด 6 ใบ ~140px รวมแถว meta)
 *
 * ยุบลงได้เพราะการ์ด 2 ใบที่กดได้ (ควรสั่ง / สต็อกวิกฤต) ซ้ำกับปุ่มมุมมองใน
 * StockToolbar เป๊ะ ๆ ทั้งจำนวนและพฤติกรรม — สอง control หนึ่ง state
 * ที่เหลือ 4 ตัวเป็นตัวเลขอ่านเฉย ๆ จึงย่อลงแต่ยังเด่นด้วยไอคอนสีและตัวเลขหนา
 */
export interface StockSummary {
  total: number;
  totalStock: number;
  totalValue: number;
  /** กี่รายการที่มูลค่ามาจากต้นทุนจริง (bi_stock_value) — ที่เหลือถอยไปใช้ราคาขาย */
  valueFromCost: number;
  cvdAll: number | null;
  promoGroups: number;
}

/**
 * ที่มาของ "มูลค่ารวม" — ต้นทุนที่คลังซื้อมา ไม่ใช่ราคาขาย
 *
 * คลังที่ export ยังไม่มีคอลัมน์ bi_stock_value จะถอยไปคิดจาก คงเหลือ × ราคาขาย
 * แบบเดิม ซึ่งเป็นคนละความหมาย — ต้องบอกไว้ ไม่งั้นเอาตัวเลขสองคลังไปเทียบกันผิด
 */
function valueSourceNote(summary: StockSummary): { title: string; approx: boolean } {
  const { valueFromCost, total } = summary;
  const amount = `${formatNumber(summary.totalValue, 2)} บาท`;
  if (total > 0 && valueFromCost === total) {
    return {
      title: `ต้นทุนจริงที่คลังซื้อมา (bi_stock_value) รวม ${amount}`,
      approx: false,
    };
  }
  if (valueFromCost === 0) {
    return {
      title: `ยังไม่มีต้นทุนของคลังนี้ — ประมาณจาก คงเหลือ × ราคาขาย = ${amount}`,
      approx: true,
    };
  }
  return {
    title: `ต้นทุนจริง ${formatNumber(valueFromCost, 0)} รายการ · อีก ${formatNumber(total - valueFromCost, 0)} รายการยังไม่มีต้นทุน จึงประมาณจากราคาขาย — รวม ${amount}`,
    approx: true,
  };
}

type Tone = "teal" | "indigo" | "amber" | "violet";

const TONE_ICON: Record<Tone, string> = {
  teal: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/20",
  indigo:
    "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20",
  amber:
    "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20",
  violet:
    "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/20",
};

interface Metric {
  key: string;
  icon: ReactNode;
  tone: Tone;
  label: string;
  /** ป้ายแบบสั้นสำหรับจอมือถือ ให้ 4 คอลัมน์พอดีความกว้างโดยไม่ต้องเลื่อน */
  shortLabel: string;
  value: string;
  shortValue: string;
  /** หน่วยต่อท้ายตัวเลข — เล็กและจาง เพื่อให้ตัวเลขเด่น */
  unit?: string;
  title: string;
}

/** ย่อจำนวนให้พอดีจอมือถือ: 772,474 → 772K · 4,120,000 → 4.1M
 *  หมายเหตุ: ไม่ใช้กับมูลค่ารวม — ผู้ใช้ต้องการเห็นเลขเต็มเสมอ */
function shortNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${formatNumber(n / 1_000_000, 1)}M`;
  if (abs >= 10_000) return `${formatNumber(n / 1_000, 0)}K`;
  return formatNumber(n, 0);
}

export function StockSummaryInline({
  summary,
  mode,
  dataDate,
  dataStaleness,
  refreshing,
  statusMsg,
  onRefresh,
}: {
  summary: StockSummary;
  mode: "list" | "promo";
  dataDate?: string | null;
  dataStaleness?: { tone: "fresh" | "stale" | "veryStale"; ageHours: number } | null;
  refreshing: boolean;
  statusMsg?: { text: string; tone: "info" | "warn" } | null;
  onRefresh: () => void;
}) {
  const stale = dataStaleness && dataStaleness.tone !== "fresh";
  const staleDays = dataStaleness
    ? Math.floor(dataStaleness.ageHours / 24)
    : 0;
  const staleTitle = stale
    ? `ข้อมูลเก่ากว่าปกติ — ยังไม่ได้ sync ${
        staleDays >= 1 ? `${staleDays} วัน` : `${Math.floor(dataStaleness!.ageHours)} ชม.`
      } · ตัวเลข cover day และ "แนะนำ" อาจไม่ตรงของจริง`
    : `ข้อมูลจาก Fabric ณ ${dataDate}`;
  const valueSource = valueSourceNote(summary);
  const metrics: Metric[] = [
    {
      key: "sku",
      icon: <Package className="h-3.5 w-3.5" />,
      tone: "teal",
      label: "จำนวน SKU",
      shortLabel: "SKU",
      value: formatNumber(summary.total, 0),
      shortValue: shortNumber(summary.total),
      unit: "รายการ",
      title: "จำนวนสินค้าที่แสดงตามตัวกรองปัจจุบัน",
    },
    {
      key: "stock",
      icon: <Boxes className="h-3.5 w-3.5" />,
      tone: "indigo",
      label: "คงเหลือรวม",
      shortLabel: "คงเหลือ",
      value: formatNumber(summary.totalStock, 0),
      shortValue: shortNumber(summary.totalStock),
      unit: "หีบ",
      title: "สต็อกคงเหลือปัจจุบันรวมทุกสินค้า (หน่วยหีบ)",
    },
    {
      key: "value",
      icon: <Wallet className="h-3.5 w-3.5" />,
      tone: "amber",
      label: "มูลค่ารวม",
      shortLabel: "มูลค่า",
      // เลขเต็มทั้งสอง breakpoint — เดิมจอแคบได้ "740K" และเกินล้านได้ "0.74 ล้านบาท"
      // ซึ่งอ่านแล้วเทียบตัวเลขจริงไม่ได้
      value: formatNumber(summary.totalValue, 0),
      shortValue: formatNumber(summary.totalValue, 0),
      // ดอกจัน = ยังมีรายการที่ประมาณจากราคาขาย ไม่ใช่ต้นทุนจริงทั้งก้อน
      unit: valueSource.approx ? "บาท*" : "บาท",
      title: valueSource.title,
    },
    mode === "promo"
      ? {
          key: "promo",
          icon: <Sparkles className="h-3.5 w-3.5" />,
          tone: "violet",
          label: "กลุ่มโปร",
          shortLabel: "กลุ่มโปร",
          value: formatNumber(summary.promoGroups, 0),
          shortValue: formatNumber(summary.promoGroups, 0),
          unit: "กลุ่ม",
          title: "จำนวนกลุ่มโปรโมชั่นที่รวมยอดข้ามสินค้าได้",
        }
      : {
          key: "cvd",
          icon: <CalendarClock className="h-3.5 w-3.5" />,
          tone: "violet",
          label: "CVD เฉลี่ย",
          shortLabel: "CVD",
          value: formatDays(summary.cvdAll).replace(" วัน", ""),
          shortValue: formatDays(summary.cvdAll).replace(" วัน", ""),
          unit: "วัน",
          title: "จำนวนวันรวมที่สินค้าเพียงพอ (Cover Day)",
        },
  ];

  return (
    <div className="shrink-0 pb-2 pt-0.5">
      <div className="flex items-stretch gap-2 rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/60 px-1 py-1.5 shadow-sm dark:border-slate-800 dark:from-slate-900/70 dark:to-slate-900/40">
        {/* 4 คอลัมน์กว้างเท่ากัน พอดีความกว้างเสมอ — ไม่มีการเลื่อนแนวนอน
            จอแคบซ่อนไอคอนและย่อตัวอักษรลงแทนที่จะดันให้ล้นออกไป */}
        <div className="grid min-w-0 flex-1 grid-cols-4">
          {metrics.map((m, i) => (
            <div
              key={m.key}
              title={m.title}
              className={cn(
                "flex min-w-0 items-center justify-center gap-2 px-1.5 sm:px-3",
                i > 0 && "border-l border-slate-200/80 dark:border-slate-700/60"
              )}
            >
              <span
                className={cn(
                  "hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 sm:flex",
                  TONE_ICON[m.tone]
                )}
                aria-hidden
              >
                {m.icon}
              </span>
              <span className="flex min-w-0 flex-col leading-none">
                <span className="truncate text-[9px] font-medium tracking-wide text-slate-400 sm:text-[10px] dark:text-slate-500">
                  <span className="sm:hidden">{m.shortLabel}</span>
                  <span className="hidden sm:inline">{m.label}</span>
                </span>
                <span className="mt-1 flex min-w-0 items-baseline gap-1">
                  <span className="truncate text-xs font-bold tabular-nums leading-none text-slate-800 sm:text-[15px] lg:text-base dark:text-slate-100">
                    <span className="sm:hidden">{m.shortValue}</span>
                    <span className="hidden sm:inline">{m.value}</span>
                  </span>
                  {m.unit && (
                    <span className="hidden shrink-0 text-[10px] font-medium text-slate-400 sm:inline dark:text-slate-500">
                      {m.unit}
                    </span>
                  )}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-l border-slate-200/80 pl-2 pr-1 dark:border-slate-700/60">
          {dataDate && (
            <span
              className={cn(
                "hidden flex-col leading-none sm:flex",
                stale && "rounded-lg px-1.5 py-1",
                dataStaleness?.tone === "stale" &&
                  "bg-amber-50 dark:bg-amber-950/40",
                dataStaleness?.tone === "veryStale" &&
                  "bg-rose-50 dark:bg-rose-950/40"
              )}
              title={staleTitle}
            >
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wide text-slate-400 dark:text-slate-500",
                  dataStaleness?.tone === "stale" &&
                    "text-amber-700 dark:text-amber-400",
                  dataStaleness?.tone === "veryStale" &&
                    "text-rose-700 dark:text-rose-400"
                )}
              >
                {stale ? "ข้อมูลค้าง" : "ข้อมูล ณ"}
              </span>
              <span
                className={cn(
                  "mt-1 flex items-center gap-1 text-[11px] font-medium leading-none text-slate-500 dark:text-slate-400",
                  dataStaleness?.tone === "stale" &&
                    "text-amber-700 dark:text-amber-400",
                  dataStaleness?.tone === "veryStale" &&
                    "text-rose-700 dark:text-rose-400"
                )}
              >
                {stale ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {dataDate}
              </span>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-lg p-0 text-slate-400 hover:bg-teal-50 hover:text-teal-700 dark:text-slate-500 dark:hover:bg-teal-950/40"
            onClick={onRefresh}
            disabled={refreshing}
            title="ตรวจข้อมูลใหม่"
            aria-label="ตรวจข้อมูลใหม่"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {statusMsg && (
        <p
          className={cn(
            "mt-1 px-1 text-[11px]",
            statusMsg.tone === "warn"
              ? "text-amber-700 dark:text-amber-400"
              : "text-teal-700 dark:text-teal-400"
          )}
        >
          {statusMsg.text}
        </p>
      )}
    </div>
  );
}
