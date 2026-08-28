"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Flag,
  Loader2,
  Percent,
  Store as StoreIcon,
} from "lucide-react";
import { appPath } from "@/lib/paths";
import { apiFetch } from "@/lib/api-fetch";
import { formatNumber } from "@/lib/calculations";
import { useVdaOptions } from "@/hooks/use-vda-options";
import { useSalesSession } from "@/hooks/use-sales-session";
import { useSalesPreview } from "@/hooks/use-sales-preview";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { SalesNav } from "./sales-nav";

interface RedFlagStore {
  storeId: string;
  storeCode: string;
  storeName: string;
  redCount: number;
  totalCount: number;
  redPct: number;
}

interface RecentDecision {
  id: string;
  status: string;
  decidedAt: string | null;
  decidedBy: string | null;
  storeCode: string;
  storeName: string;
  itemCount: number;
}

interface DashboardData {
  pending: number;
  priceFlagged: number;
  approval: {
    approved: number;
    rejected: number;
    decided: number;
    ratePct: number | null;
  };
  topRedFlagStores: RedFlagStore[];
  recentDecisions: RecentDecision[];
  windowDays: number;
}

const WINDOW_DAYS = 30;

export function SalesDashboardClient() {
  // สิทธิ์ VDA ต้องมาก่อน ไม่งั้นยิงคิวรีตอน scope ยังว่างแล้วได้ศูนย์หลอกตา
  const { ready } = useVdaOptions();
  const { session } = useSalesSession();
  const salesPreview = useSalesPreview();

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ["sales-dashboard", WINDOW_DAYS],
    queryFn: async () => {
      const res = await apiFetch(
        `${appPath("/api/sales/dashboard")}?days=${WINDOW_DAYS}`
      );
      if (!res.ok) throw new Error(`โหลดภาพรวมไม่สำเร็จ (${res.status})`);
      return res.json();
    },
    enabled: ready,
    staleTime: 60_000,
  });

  const approval = data?.approval;
  const ratePct = approval?.ratePct;

  return (
    <PageShell>
      <AppHeader
        compact
        wide
        title="ภาพรวม"
        subtitle={
          salesPreview
            ? `${salesPreview.asCode} · ${salesPreview.asName}`
            : (session?.salesmanName ??
              session?.salesmanCode ??
              session?.email ??
              "สรุปงานค้างและสถานะการอนุมัติ")
        }
        role={session?.role ?? "sales"}
      />

      <main className="mx-auto w-full max-w-[min(100%,96rem)] space-y-3 px-3 py-3 sm:px-4">
        <SalesNav />

        {isError && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <span>โหลดภาพรวมไม่สำเร็จ</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              ลองใหม่
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Link href="/sales/orders" className="contents">
            <StatCard
              icon={<ClipboardList className="h-4 w-4" />}
              label="ออเดอร์รอตรวจ"
              value={formatNumber(data?.pending ?? 0, 0)}
              tone={(data?.pending ?? 0) > 0 ? "teal" : "default"}
              className="cursor-pointer transition hover:ring-2 hover:ring-teal-200 dark:hover:ring-teal-900"
            />
          </Link>
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="มีราคาที่ร้านแก้เอง"
            value={formatNumber(data?.priceFlagged ?? 0, 0)}
            tone={(data?.priceFlagged ?? 0) > 0 ? "amber" : "default"}
          />
          <StatCard
            icon={<Percent className="h-4 w-4" />}
            label={`อัตราอนุมัติ (${WINDOW_DAYS} วัน)`}
            value={ratePct === null || ratePct === undefined ? "—" : `${ratePct.toFixed(0)}%`}
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label={`ตัดสินแล้ว (${WINDOW_DAYS} วัน)`}
            value={formatNumber(approval?.decided ?? 0, 0)}
          />
        </div>

        {/*
          ตัวหารของอัตราอนุมัติคือออเดอร์ที่พนักงานตัดสินแล้วเท่านั้น — ออเดอร์ที่ร้าน
          ถอนเองถูกลบออกจากฐานข้อมูล (hard delete) จึงไม่เคยอยู่ในตัวหารตั้งแต่แรก
          ต้องเขียนไว้ ไม่งั้นตัวเลขนี้ถูกอ่านว่า "จากออเดอร์ทั้งหมดที่ร้านส่งมา"
        */}
        <p className="px-1 text-[11px] text-slate-400 dark:text-slate-500">
          อัตราอนุมัติ = อนุมัติ {formatNumber(approval?.approved ?? 0, 0)} จากที่ตัดสินแล้ว{" "}
          {formatNumber(approval?.decided ?? 0, 0)} ใบ (ปฏิเสธ{" "}
          {formatNumber(approval?.rejected ?? 0, 0)}) · ไม่รวมออเดอร์ที่ร้านถอนเอง
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Flag className="h-4 w-4 text-red-500" />
              ร้านที่ติดธงแดงมากที่สุด
              <span className="font-normal text-slate-400">({WINDOW_DAYS} วัน)</span>
            </h2>

            {isLoading || !ready ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลด…
              </p>
            ) : !data?.topRedFlagStores.length ? (
              <p className="py-10 text-center text-sm text-slate-500">
                ไม่มีร้านที่ติดธงแดงในช่วงนี้
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {data.topRedFlagStores.map((s) => (
                  <li
                    key={s.storeId}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
                  >
                    <StoreIcon className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {s.storeName || s.storeCode.toUpperCase()}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {s.storeCode.toUpperCase()} · {formatNumber(s.totalCount, 0)} บรรทัด
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">
                        {formatNumber(s.redCount, 0)}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {s.redPct.toFixed(0)}%
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <CheckCircle2 className="h-4 w-4 text-teal-500" />
              ตัดสินล่าสุด
            </h2>

            {isLoading || !ready ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลด…
              </p>
            ) : !data?.recentDecisions.length ? (
              <p className="py-10 text-center text-sm text-slate-500">
                ยังไม่มีออเดอร์ที่ตัดสินในช่วงนี้
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {data.recentDecisions.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
                  >
                    <span
                      className={
                        d.status === "approved"
                          ? "rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-400"
                          : "rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      }
                    >
                      {d.status === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {d.storeName || d.storeCode.toUpperCase()}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {formatNumber(d.itemCount, 0)} รายการ
                        {d.decidedBy ? ` · ${d.decidedBy}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatDecidedAt(d.decidedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </PageShell>
  );
}

function formatDecidedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
