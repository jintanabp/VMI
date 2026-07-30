"use client";

import { appPath } from "@/lib/paths";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, ChevronRight, History, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MobileRow,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import { formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import type { OrderHistoryEntry } from "@/app/api/store/order-history/route";

const STATUS_FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "pending_approval", label: "รออนุมัติ" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "rejected", label: "ปฏิเสธ" },
] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_approval: {
    label: "รออนุมัติ",
    className:
      "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30",
  },
  approved: {
    label: "อนุมัติแล้ว",
    className:
      "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30",
  },
  rejected: {
    label: "ปฏิเสธ",
    className:
      "bg-red-100 text-red-800 ring-red-200 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-500/30",
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className:
      "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1",
        meta.className
      )}
    >
      {meta.label}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderHistoryClient({
  storeCode,
  storeName,
  storeAddress,
  isVda,
}: {
  storeCode: string;
  storeName: string;
  storeAddress: string;
  isVda?: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery<{
    orders: OrderHistoryEntry[];
    truncated: boolean;
  }>({
    queryKey: ["order-history"],
    queryFn: async () => {
      const res = await fetch(appPath("/api/store/order-history"), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`โหลดประวัติไม่สำเร็จ (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const orders = useMemo(() => data?.orders ?? [], [data?.orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (!q) return true;
      return o.items.some(
        (i) =>
          i.skuCode.toLowerCase().includes(q) ||
          i.skuName.toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, search]);

  const stats = useMemo(() => {
    let totalQty = 0;
    let pending = 0;
    for (const o of orders) {
      totalQty += o.totalQty;
      if (o.status === "pending_approval") pending++;
    }
    return { count: orders.length, totalQty, pending };
  }, [orders]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const headerTitle = useMemo(() => {
    const base = `ประวัติการสั่ง · ${storeCode.toUpperCase()}`;
    const name = storeName?.trim();
    if (!name || name.toUpperCase() === storeCode.toUpperCase()) return base;
    return `${base} · ${name}`;
  }, [storeCode, storeName]);

  return (
    <PageShell className="pb-20">
      <AppHeader
        compact
        wide
        title={headerTitle}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main className="mx-auto w-full min-w-0 max-w-5xl px-3 py-3 sm:px-4">
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard
            icon={<History className="h-4 w-4" />}
            label="ออเดอร์ทั้งหมด"
            value={formatNumber(stats.count, 0)}
          />
          <SummaryCard
            icon={<CalendarClock className="h-4 w-4" />}
            label="รออนุมัติ"
            value={formatNumber(stats.pending, 0)}
          />
          <SummaryCard
            label="รวมที่สั่ง (หีบ)"
            value={formatNumber(stats.totalQty, 0)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อสินค้าในออเดอร์..."
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={statusFilter === f.value ? "default" : "outline"}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {isError && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <span>โหลดประวัติการสั่งไม่สำเร็จ</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700"
            >
              ลองใหม่
            </button>
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {isLoading ? (
            <p className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              กำลังโหลด...
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {orders.length === 0
                ? "ยังไม่มีประวัติการสั่ง"
                : "ไม่พบออเดอร์ตามตัวกรอง"}
            </p>
          ) : (
            <MobileRowList>
              {filtered.map((order) => {
                const open = expanded.has(order.id);
                return (
                  <MobileRow key={order.id}>
                    <MobileRowTop>
                      <button
                        type="button"
                        onClick={() => toggle(order.id)}
                        className="flex min-w-0 flex-1 items-start gap-2 text-left"
                        aria-expanded={open}
                      >
                        {open ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatDateTime(order.createdAt)}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {order.items
                              .slice(0, 3)
                              .map((i) => i.skuName)
                              .join(", ")}
                            {order.items.length > 3 &&
                              ` +${order.items.length - 3}`}
                          </span>
                        </span>
                      </button>
                      <StatusBadge status={order.status} />
                    </MobileRowTop>

                    <MobileRowStats className="pl-6">
                      <MobileStat
                        label="รายการ"
                        value={formatNumber(order.itemCount, 0)}
                      />
                      <MobileStat
                        label="รวม · หีบ"
                        value={formatNumber(order.totalQty, 0)}
                        highlight
                      />
                      {order.approvedAt && (
                        <MobileStat
                          label="อนุมัติ"
                          value={formatDateTime(order.approvedAt)}
                        />
                      )}
                    </MobileRowStats>

                    {order.poNumbers && order.poNumbers.length > 0 && (
                      <p className="mt-1 flex flex-wrap items-center gap-1 pl-6 text-[11px] text-slate-500 dark:text-slate-400">
                        เลข PO:
                        {order.poNumbers.map((po) => (
                          <span
                            key={po}
                            className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          >
                            {po}
                          </span>
                        ))}
                      </p>
                    )}

                    {order.rejectReason && (
                      <p className="mt-1 pl-6 text-[11px] text-red-600 dark:text-red-400">
                        เหตุผลที่ปฏิเสธ: {order.rejectReason}
                      </p>
                    )}

                    {open && (
                      <div className="mt-2 overflow-x-auto rounded-lg bg-slate-50 dark:bg-slate-800/40">
                        <table className="w-full min-w-[26rem] text-left text-xs">
                          <thead className="text-[11px] text-slate-500 dark:text-slate-400">
                            <tr>
                              <th className="px-2 py-1.5">รหัส</th>
                              <th className="px-2 py-1.5">ชื่อสินค้า</th>
                              <th className="px-2 py-1.5 text-right">ขอ (หีบ)</th>
                              <th className="px-2 py-1.5 text-right">
                                อนุมัติ (หีบ)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item) => (
                              <tr
                                key={item.skuId}
                                className="border-t border-slate-200/70 dark:border-slate-700/50"
                              >
                                <td className="px-2 py-1.5 font-mono text-teal-700 dark:text-teal-400">
                                  {item.skuCode}
                                </td>
                                <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                                  {item.skuName}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                                  {formatNumber(item.suggestedQty, 0)}
                                </td>
                                <td
                                  className={cn(
                                    "px-2 py-1.5 text-right font-semibold tabular-nums",
                                    item.finalQty !== item.suggestedQty
                                      ? "text-amber-700 dark:text-amber-400"
                                      : "text-slate-900 dark:text-slate-100"
                                  )}
                                >
                                  {formatNumber(item.finalQty, 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </MobileRow>
                );
              })}
            </MobileRowList>
          )}
        </div>

        {data?.truncated && (
          <p className="mt-2 text-center text-[11px] text-slate-400">
            แสดง 100 ออเดอร์ล่าสุดเท่านั้น
          </p>
        )}
      </main>
    </PageShell>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}
