"use client";

import { appPath } from "@/lib/paths";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  lastDate?: string | null;
  summary?: SalesSummary | null;
}

interface WeekBucket {
  start: string;
  end: string;
  label: string;
  qty: number;
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

/** รวม series (เก่า→ใหม่) เป็นก้อนสัปดาห์ละ ≤7 วัน */
function toWeeklyBuckets(series: DailySale[]): WeekBucket[] {
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const start = chunk[0]!.date;
    const end = chunk[chunk.length - 1]!.date;
    weeks.push({
      start,
      end,
      label: `${formatDay(start)}–${formatDay(end)}`,
      qty: chunk.reduce((s, d) => s + d.qty, 0),
    });
  }
  return weeks;
}

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

  // react-query: key ผูก sku/fromDb/days → ปุ่มรีเฟรช invalidate ["sales-daily"] ได้
  // และไม่รั่วข้ามร้าน (ต่างจาก module Map เดิม) + ได้ gc/staleTime ฟรี
  const { data, isLoading: loading } = useQuery<SalesResponse>({
    queryKey: ["sales-daily", skuCode, fromDb ?? "", viewDays],
    queryFn: async () => {
      const params = new URLSearchParams({ sku: skuCode, days: String(viewDays) });
      if (fromDb) params.set("fromDb", fromDb);
      const r = await fetch(`${appPath("/api/sales/daily")}?${params.toString()}`);
      if (!r.ok) throw new Error("failed to load daily sales");
      return (await r.json()) as SalesResponse;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const summary = data?.summary;
  const everSold = Boolean(summary?.hasData);
  const series = useMemo(() => summary?.series ?? [], [summary]);
  const total = summary?.total ?? 0;
  const avgPerDay = summary?.avgPerDay ?? 0;
  const avgPerWeek = summary?.avgPerWeek ?? 0;
  const isMonthView = viewDays >= 30;

  const peak = useMemo(() => {
    let best: DailySale | null = null;
    for (const d of series) {
      if (!best || d.qty > best.qty) best = d;
    }
    return best && best.qty > 0 ? best : null;
  }, [series]);

  const weeks = useMemo(
    () => (isMonthView ? toWeeklyBuckets(series) : []),
    [isMonthView, series]
  );

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

  return (
    <div className="space-y-2.5 rounded-lg bg-slate-50/80 p-3 dark:bg-slate-800/40">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200"
          title="ยอดขายจริงจากบิล (factsales) — คนละชุดกับคอลัมน์ 'ขายเฉลี่ย·คลัง' ที่มาจาก stock_cover"
        >
          <BarChart3 className="h-3.5 w-3.5 text-teal-600" />
          ยอดขาย {viewDays} วัน · บิล
        </span>
        {dayToggle}
        <SummaryPill label="เฉลี่ย/วัน" value={formatNumber(avgPerDay, 1)} />
        <SummaryPill
          label="เฉลี่ย/สัปดาห์"
          value={formatNumber(avgPerWeek, 0)}
          tone="teal"
          icon
        />
        <SummaryPill label="รวม" value={formatNumber(total, 0)} />
        {isMonthView && peak && (
          <SummaryPill
            label="สูงสุด"
            value={`${formatNumber(peak.qty, peak.qty < 10 ? 1 : 0)} (${formatDay(peak.date)})`}
          />
        )}
      </div>

      {total === 0 ? (
        <p
          className={cn(
            "text-[11px]",
            everSold
              ? "text-amber-600 dark:text-amber-400"
              : "text-slate-500 dark:text-slate-400"
          )}
        >
          {everSold
            ? `ไม่มียอดขายใน ${viewDays} วันที่ผ่านมา (เคยมีการขาย)`
            : `ไม่มียอดขายใน ${viewDays} วันที่ผ่านมา (ไม่เคยมีการขาย)`}
        </p>
      ) : isMonthView ? (
        <MonthSalesView series={series} weeks={weeks} />
      ) : (
        <DailyBars series={series} />
      )}
    </div>
  );
}

function DailyBars({ series }: { series: DailySale[] }) {
  const maxQty = Math.max(...series.map((d) => d.qty), 1);
  return (
    <div className="space-y-1">
      {series.map((d) => (
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
              style={{
                width: `${Math.max((d.qty / maxQty) * 100, d.qty > 0 ? 4 : 0)}%`,
              }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">
            {d.qty > 0 ? formatNumber(d.qty, d.qty < 10 ? 1 : 0) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function MonthSalesView({
  series,
  weeks,
}: {
  series: DailySale[];
  weeks: WeekBucket[];
}) {
  const maxWeek = Math.max(...weeks.map((w) => w.qty), 1);

  return (
    <div className="space-y-3">
      <SalesSparkline series={series} />

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          รวมรายสัปดาห์
        </p>
        {weeks.map((w) => (
          <div key={w.start} className="flex items-center gap-2">
            <span className="w-[4.5rem] shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              {w.label}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-200/70 dark:bg-slate-700/50">
              <div
                className={cn(
                  "h-full rounded",
                  w.qty > 0 ? "bg-teal-500/80" : "bg-transparent"
                )}
                style={{
                  width: `${Math.max((w.qty / maxWeek) * 100, w.qty > 0 ? 4 : 0)}%`,
                }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">
              {w.qty > 0 ? formatNumber(w.qty, w.qty < 10 ? 1 : 0) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesSparkline({ series }: { series: DailySale[] }) {
  const w = 280;
  const h = 36;
  const padX = 2;
  const padY = 4;
  const maxQty = Math.max(...series.map((d) => d.qty), 1);
  const n = series.length;
  if (n === 0) return null;

  const points = series.map((d, i) => {
    const x = padX + (i / Math.max(n - 1, 1)) * (w - padX * 2);
    const y = h - padY - (d.qty / maxQty) * (h - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const areaPoints = [
    `${padX},${h - padY}`,
    ...points,
    `${w - padX},${h - padY}`,
  ].join(" ");

  const first = series[0]!;
  const last = series[n - 1]!;

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{formatDay(first.date)}</span>
        <span>แนวโน้มรายวัน</span>
        <span>{formatDay(last.date)}</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="mt-0.5 h-9 w-full overflow-visible"
        aria-hidden
      >
        <polygon
          points={areaPoints}
          className="fill-teal-500/15 dark:fill-teal-400/10"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-teal-600 dark:stroke-teal-400"
        />
      </svg>
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
