"use client";

import { appPath } from "@/lib/paths";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  History,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import type { OrderHistoryEntry } from "@/app/api/store/order-history/route";
import type { StoreNotificationRow } from "@/lib/orders/store-notify";

const STATUS_FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "pending_approval", label: "รออนุมัติ" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "rejected", label: "ปฏิเสธ" },
] as const;

interface StatusMeta {
  label: string;
  badge: string;
  /** เส้นซ้ายของการ์ด — อ่านสถานะได้จากหางตาโดยไม่ต้องอ่าน badge */
  accent: string;
  icon: typeof Clock;
}

const STATUS_META: Record<string, StatusMeta> = {
  pending_approval: {
    label: "รออนุมัติ",
    badge:
      "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30",
    accent: "border-l-amber-400 dark:border-l-amber-500",
    icon: Clock,
  },
  approved: {
    label: "อนุมัติแล้ว",
    badge:
      "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30",
    accent: "border-l-emerald-400 dark:border-l-emerald-500",
    icon: Check,
  },
  rejected: {
    label: "ปฏิเสธ",
    badge:
      "bg-red-100 text-red-800 ring-red-200 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-500/30",
    accent: "border-l-red-400 dark:border-l-red-500",
    icon: X,
  },
};

const FALLBACK_META: StatusMeta = {
  label: "ไม่ทราบสถานะ",
  badge:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600",
  accent: "border-l-slate-300 dark:border-l-slate-600",
  icon: Clock,
};

const NOTIF_META: Record<string, { label: string; className: string }> = {
  approved: {
    label: "อนุมัติ",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  rejected: {
    label: "ปฏิเสธ",
    className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  },
  deleted: {
    label: "ลบออเดอร์",
    className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
  },
  price_changed: {
    label: "แก้ราคา",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  },
  qty_changed: {
    label: "แก้จำนวน",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  },
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีก่อน`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} ชม.ก่อน`;
  const d = Math.round(h / 24);
  return d <= 30 ? `${d} วันก่อน` : fmtDateTime(iso);
}

function SummaryTile({
  icon,
  label,
  value,
  unit,
  tone = "slate",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  tone?: "slate" | "amber" | "emerald" | "teal";
}) {
  const iconTone = {
    slate:
      "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300",
    amber:
      "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    emerald:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    teal: "bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
  }[tone];

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          iconTone
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </span>
        <span className="mt-1 flex items-baseline gap-1">
          <span className="truncate text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {value}
          </span>
          {unit && (
            <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500">
              {unit}
            </span>
          )}
        </span>
      </span>
    </div>
  );
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
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAllNotif, setShowAllNotif] = useState(false);

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

  const { data: notifData } = useQuery<{
    items: StoreNotificationRow[];
    unread: number;
  }>({
    queryKey: ["store-notifications"],
    queryFn: async () => {
      const res = await fetch(appPath("/api/store/notifications"), {
        cache: "no-store",
      });
      if (!res.ok) return { items: [], unread: 0 };
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: async () => {
      await fetch(appPath("/api/store/notifications"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["store-notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["store-notifications-count"],
      });
    },
  });

  const notifications = notifData?.items ?? [];
  const unread = notifData?.unread ?? 0;
  const visibleNotifications = showAllNotif
    ? notifications
    : notifications.slice(0, 4);

  const orders = useMemo(() => data?.orders ?? [], [data?.orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.poNumbers?.some((po) => po.toLowerCase().includes(q)) ||
        o.items.some(
          (i) =>
            i.skuCode.toLowerCase().includes(q) ||
            i.skuName.toLowerCase().includes(q)
        )
      );
    });
  }, [orders, statusFilter, search]);

  const stats = useMemo(() => {
    let totalQty = 0;
    let pending = 0;
    let approved = 0;
    for (const o of orders) {
      totalQty += o.totalQty;
      if (o.status === "pending_approval") pending++;
      if (o.status === "approved") approved++;
    }
    return { count: orders.length, totalQty, pending, approved };
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

      <main className="mx-auto w-full min-w-0 max-w-5xl space-y-3 px-3 py-3 sm:px-4">
        {/* ---- แจ้งเตือนจากพนักงาน ---- */}
        {notifications.length > 0 && (
          <section
            className={cn(
              "overflow-hidden rounded-2xl border shadow-sm",
              unread > 0
                ? "border-teal-200 bg-teal-50/60 dark:border-teal-900/60 dark:bg-teal-950/25"
                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60"
            )}
          >
            <header className="flex items-center gap-2 px-3 py-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  unread > 0
                    ? "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                )}
              >
                {unread > 0 ? (
                  <Bell className="h-4 w-4" />
                ) : (
                  <BellOff className="h-4 w-4" />
                )}
              </span>
              <p className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                การแจ้งเตือนจากพนักงาน
                {unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    ใหม่ {unread}
                  </span>
                )}
              </p>
              {unread > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  pending={markRead.isPending}
                  onClick={() => markRead.mutate()}
                >
                  อ่านทั้งหมด
                </Button>
              )}
            </header>
            <ul className="divide-y divide-slate-200/70 border-t border-slate-200/70 dark:divide-slate-800 dark:border-slate-800">
              {visibleNotifications.map((n) => {
                const meta = NOTIF_META[n.kind] ?? {
                  label: n.kind,
                  className: "bg-slate-100 text-slate-700",
                };
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "flex flex-wrap items-start gap-x-2 gap-y-1 px-3 py-2",
                      !n.readAt && "bg-white/70 dark:bg-slate-900/40"
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                        meta.className
                      )}
                    >
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                        {!n.readAt && (
                          <span
                            className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle"
                            aria-label="ยังไม่อ่าน"
                          />
                        )}
                        {n.title}
                      </p>
                      {n.detail && (
                        <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-slate-400">
                          {n.detail}
                        </p>
                      )}
                      {n.poNumbers.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {n.poNumbers.map((po) => (
                            <span
                              key={po}
                              className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            >
                              {po}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {relativeTime(n.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {notifications.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllNotif((v) => !v)}
                className="w-full border-t border-slate-200/70 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                {showAllNotif
                  ? "ย่อ"
                  : `ดูทั้งหมด ${notifications.length} รายการ`}
              </button>
            )}
          </section>
        )}

        {/* ---- สรุป ---- */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SummaryTile
            icon={<History className="h-4 w-4" />}
            label="ออเดอร์ทั้งหมด"
            value={formatNumber(stats.count, 0)}
            unit="ใบ"
          />
          <SummaryTile
            icon={<Clock className="h-4 w-4" />}
            label="รออนุมัติ"
            value={formatNumber(stats.pending, 0)}
            unit="ใบ"
            tone="amber"
          />
          <SummaryTile
            icon={<Check className="h-4 w-4" />}
            label="อนุมัติแล้ว"
            value={formatNumber(stats.approved, 0)}
            unit="ใบ"
            tone="emerald"
          />
          <SummaryTile
            icon={<Boxes className="h-4 w-4" />}
            label="รวมที่สั่ง"
            value={formatNumber(stats.totalQty, 0)}
            unit="หีบ"
            tone="teal"
          />
        </div>

        {/* ---- ตัวกรอง ---- */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อสินค้า / เลข PO..."
              className="pl-8"
            />
          </div>
          <div className="flex shrink-0 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  statusFilter === f.value
                    ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isError && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <span>โหลดประวัติการสั่งไม่สำเร็จ</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              ลองใหม่
            </Button>
          </div>
        )}

        {/* ---- รายการออเดอร์ ---- */}
        {isLoading ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-3 py-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            กำลังโหลด...
          </p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-12 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {orders.length === 0
                ? "ยังไม่มีประวัติการสั่ง"
                : "ไม่พบออเดอร์ตามตัวกรอง"}
            </p>
            {orders.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                เลือกสินค้าที่หน้า &quot;สินค้า&quot; แล้วกดตรวจสอบคำสั่งเพื่อส่งออเดอร์แรก
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((order) => {
              const open = expanded.has(order.id);
              const meta = STATUS_META[order.status] ?? FALLBACK_META;
              const StatusIcon = meta.icon;
              return (
                <li
                  key={order.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border border-l-[3px] border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/60",
                    meta.accent
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggle(order.id)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                  >
                    {open ? (
                      <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {fmtDateTime(order.createdAt)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                            meta.badge
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {relativeTime(order.createdAt)}
                        </span>
                      </div>

                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {order.items
                          .slice(0, 3)
                          .map((i) => i.skuName)
                          .join(" · ")}
                        {order.items.length > 3 &&
                          ` +${order.items.length - 3} รายการ`}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {formatNumber(order.itemCount, 0)} รายการ
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                          <Boxes className="h-3 w-3" />
                          {formatNumber(order.totalQty, 0)} หีบ
                        </span>
                        {order.approvedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            อนุมัติ {fmtDateTime(order.approvedAt)}
                          </span>
                        )}
                      </div>

                      {order.poNumbers && order.poNumbers.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            เลข PO
                          </span>
                          {order.poNumbers.map((po) => (
                            <span
                              key={po}
                              className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              title="ใช้อ้างอิงเวลาตามของกับฝ่ายจัดซื้อ"
                            >
                              {po}
                            </span>
                          ))}
                        </div>
                      )}

                      {order.rejectReason && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
                          <Trash2 className="mt-0.5 h-3 w-3 shrink-0" />
                          เหตุผลที่ปฏิเสธ: {order.rejectReason}
                        </p>
                      )}
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[26rem] text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                            <tr>
                              <th className="px-3 py-1.5 font-medium">รหัส</th>
                              <th className="px-3 py-1.5 font-medium">
                                ชื่อสินค้า
                              </th>
                              <th className="px-3 py-1.5 text-right font-medium">
                                ขอ (หีบ)
                              </th>
                              <th className="px-3 py-1.5 text-right font-medium">
                                สั่งจริง (หีบ)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item) => {
                              const changed =
                                item.finalQty !== item.suggestedQty;
                              return (
                                <tr
                                  key={item.skuId}
                                  className="border-t border-slate-100 dark:border-slate-800"
                                >
                                  <td className="px-3 py-1.5 font-mono text-teal-700 dark:text-teal-400">
                                    {item.skuCode}
                                  </td>
                                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                                    {item.skuName}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                                    {formatNumber(item.suggestedQty, 0)}
                                  </td>
                                  <td
                                    className={cn(
                                      "px-3 py-1.5 text-right font-semibold tabular-nums",
                                      changed
                                        ? "text-amber-700 dark:text-amber-400"
                                        : "text-slate-800 dark:text-slate-100"
                                    )}
                                    title={
                                      changed
                                        ? "ต่างจากจำนวนที่ระบบแนะนำ"
                                        : undefined
                                    }
                                  >
                                    {formatNumber(item.finalQty, 0)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {data?.truncated && (
          <p className="text-center text-xs text-slate-400">
            แสดง 100 ออเดอร์ล่าสุด
          </p>
        )}

        <p className="flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
          <Wallet className="mt-0.5 h-3 w-3 shrink-0" />
          จำนวนที่แสดงเป็นหน่วยหีบ · ออเดอร์ก่อน 30 ก.ค. 2569 บันทึกเป็นหน่วยชิ้น
          ตัวเลขอาจดูสูงกว่าปกติ
        </p>
      </main>
    </PageShell>
  );
}
