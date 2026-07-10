"use client";

import { useEffect, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";

interface DailySale {
  date: string;
  qty: number;
}

interface SalesSummary {
  series: DailySale[];
  total: number;
  avgPerDay: number;
  avgPerWeek: number;
  hasData: boolean;
}

interface SalesResponse {
  available?: boolean;
  summary?: SalesSummary | null;
}

function formatDay(date: string) {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function weekdayShort(date: string) {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { weekday: "short" });
}

const cache = new Map<string, SalesResponse>();

const DAY_OPTIONS = [7, 30] as const;

export function ProductSalesPanel({
  skuCode,
  fromDb,
  days = 7,
}: {
  skuCode: string;
  fromDb?: string | null;
  days?: number;
}) {
  const [viewDays, setViewDays] = useState<number>(days);
  const cacheKey = `${skuCode}|${fromDb ?? ""}|${viewDays}`;
  const [data, setData] = useState<SalesResponse | null>(
    () => cache.get(cacheKey) ?? null
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey));

  useEffect(() => {
    if (cache.has(cacheKey)) {
      setData(cache.get(cacheKey)!);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ sku: skuCode, days: String(viewDays) });
    if (fromDb) params.set("fromDb", fromDb);
    fetch(`/api/sales/daily?${params.toString()}`)
      .then((r) => r.json())
      .then((payload: SalesResponse) => {
        cache.set(cacheKey, payload);
        if (alive) setData(payload);
      })
      .catch(() => {
        if (alive) setData({ available: false, summary: null });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey, skuCode, fromDb, viewDays]);

  const dayToggle = (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
      {DAY_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setViewDays(d);
          }}
          className={cn(
            "px-2 py-0.5 text-[11px] font-medium transition",
            viewDays === d
              ? "bg-teal-600 text-white"
              : "bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          )}
        >
          {d} วัน
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
        กำลังโหลดยอดขาย...
      </p>
    );
  }

  if (!data?.available) {
    return (
      <p className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
        ยังไม่มีข้อมูลยอดขายรายวันในระบบ
      </p>
    );
  }

  const summary = data.summary;
  if (!summary || !summary.hasData) {
    return (
      <div className="space-y-2 rounded-lg bg-slate-50/80 p-3 text-center dark:bg-slate-800/40">
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            ยอดขายร้านนี้
          </span>
          {dayToggle}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          ร้านนี้ไม่มียอดขายสินค้านี้ใน {viewDays} วันที่ผ่านมา
        </p>
      </div>
    );
  }

  const maxQty = Math.max(...summary.series.map((d) => d.qty), 1);

  return (
    <div className="space-y-2.5 rounded-lg bg-slate-50/80 p-3 dark:bg-slate-800/40">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
          <BarChart3 className="h-3.5 w-3.5 text-teal-600" />
          ยอดขาย {viewDays} วัน
        </span>
        {dayToggle}
        <SummaryPill
          label="เฉลี่ย/วัน"
          value={formatNumber(summary.avgPerDay, 1)}
        />
        <SummaryPill
          label="เฉลี่ย/สัปดาห์"
          value={formatNumber(summary.avgPerWeek, 0)}
          tone="teal"
          icon
        />
        <SummaryPill label="รวม" value={formatNumber(summary.total, 0)} />
      </div>

      {summary.total === 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          ไม่มียอดขายใน {viewDays} วันที่ผ่านมา (เคยขายก่อนหน้านี้)
        </p>
      )}

      <div className="space-y-1">
        {summary.series.map((d) => (
          <div key={d.date} className="flex items-center gap-2">
            <span
              className="w-10 shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400"
              title={weekdayShort(d.date) || undefined}
            >
              {formatDay(d.date)}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-200/70 dark:bg-slate-700/50">
              <div
                className={cn(
                  "h-full rounded",
                  d.qty > 0 ? "bg-teal-500/80" : "bg-transparent"
                )}
                style={{ width: `${Math.max((d.qty / maxQty) * 100, d.qty > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">
              {d.qty > 0 ? formatNumber(d.qty, d.qty < 10 ? 1 : 0) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  tone = "slate",
  icon = false,
}: {
  label: string;
  value: string;
  tone?: "slate" | "teal";
  icon?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]",
        tone === "teal"
          ? "bg-teal-100 text-teal-800 ring-1 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-200 dark:ring-teal-500/25"
          : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:ring-slate-700"
      )}
    >
      {icon && <TrendingUp className="h-3 w-3" />}
      <span className="text-slate-400 dark:text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}
