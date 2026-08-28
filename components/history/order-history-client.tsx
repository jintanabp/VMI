"use client";

import { appPath } from "@/lib/paths";
import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Gift,
  History,
  RotateCcw,
  Sparkles,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { usePromoGroupNames } from "@/hooks/use-promo-group-names";
import { formatBaht, formatNumber } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import type { OrderHistoryEntry } from "@/app/api/store/order-history/route";
import { fmtDateTime, relativeTime } from "@/lib/orders/store-notify-display";

const STATUS_FILTERS = [
  { value: "", label: "ทั้งหมด" },
  { value: "pending_approval", label: "รออนุมัติ" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "rejected", label: "ปฏิเสธ" },
] as const;

const DAY_FILTERS = [
  { value: 7, label: "7 วัน" },
  { value: 30, label: "30 วัน" },
  { value: 90, label: "90 วัน" },
  { value: 0, label: "ทั้งหมด" },
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
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </span>
        <span className="mt-1 flex items-baseline gap-1">
          <span className="truncate text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {value}
          </span>
          {unit && (
            <span className="shrink-0 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {unit}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

/** เส้นเวลาของออเดอร์ — ตอบคำถาม "ตอนนี้ไปถึงไหนแล้ว" โดยไม่ต้องตีความ badge */
function OrderTimeline({ order }: { order: OrderHistoryEntry }) {
  const rejected = order.status === "rejected";
  const steps = [
    { label: "ส่งออเดอร์", at: order.createdAt, done: true },
    {
      label: rejected ? "ปฏิเสธ" : "อนุมัติ",
      // decidedAt ครอบทั้งอนุมัติและปฏิเสธ — approvedAt เป็น null เสมอเมื่อถูกปฏิเสธ
      // (fallback ไว้ให้ออเดอร์ที่ตัดสินไปก่อนจะมีคอลัมน์นี้)
      at: order.decidedAt ?? order.approvedAt,
      done: order.status !== "pending_approval",
    },
    {
      label: "ออก PO",
      at: order.poIssuedAt,
      done: order.poNumbers.length > 0,
      // ออเดอร์ที่ถูกปฏิเสธไม่มีทางไปถึงขั้นนี้ — ซ่อนไปเลยดีกว่าค้างเป็นจุดจาง
      hidden: rejected,
    },
  ].filter((s) => !s.hidden);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 px-3 py-2.5">
      {steps.map((s, idx) => (
        <li key={s.label} className="flex items-center gap-1">
          <span
            className={cn(
              "flex flex-col items-start rounded-lg px-2 py-1",
              s.done
                ? rejected && idx === 1
                  ? "bg-red-50 dark:bg-red-950/30"
                  : "bg-emerald-50 dark:bg-emerald-950/30"
                : "bg-slate-50 dark:bg-slate-800/40"
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-semibold",
                s.done
                  ? rejected && idx === 1
                    ? "text-red-700 dark:text-red-300"
                    : "text-emerald-700 dark:text-emerald-300"
                  : "text-slate-400 dark:text-slate-500"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  s.done
                    ? rejected && idx === 1
                      ? "bg-red-500"
                      : "bg-emerald-500"
                    : "bg-slate-300 dark:bg-slate-600"
                )}
              />
              {s.label}
            </span>
            <span className="text-[11px] tabular-nums text-slate-400">
              {/*
                "รอดำเนินการ" ใช้ได้เฉพาะขั้นที่ยังไม่เกิดขึ้น — ออเดอร์เก่าที่ถูกปฏิเสธ
                ก่อนมีคอลัมน์ decidedAt ไม่มีเวลาให้แสดง เดิมจึงขึ้นป้าย "ปฏิเสธ"
                คู่กับข้อความ "รอดำเนินการ" ซึ่งขัดกันเองในบรรทัดเดียว
              */}
              {s.at ? fmtDateTime(s.at) : s.done ? "ไม่มีข้อมูลเวลา" : "รอดำเนินการ"}
            </span>
          </span>
          {idx < steps.length - 1 && (
            <span
              className={cn(
                "h-px w-4 shrink-0",
                steps[idx + 1].done
                  ? "bg-emerald-300 dark:bg-emerald-700"
                  : "bg-slate-200 dark:bg-slate-700"
              )}
              aria-hidden
            />
          )}
        </li>
      ))}
    </ol>
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
  const router = useRouter();
  const { toast } = useToast();
  const { label: groupLabel, tooltip: groupTooltip } = usePromoGroupNames();
  const [statusFilter, setStatusFilter] = useState("");
  const [dayFilter, setDayFilter] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<OrderHistoryEntry | null>(
    null
  );

  const { data, isLoading, isError, refetch } = useQuery<{
    orders: OrderHistoryEntry[];
    truncated: boolean;
  }>({
    queryKey: ["order-history"],
    queryFn: async () => {
      const res = await apiFetch(appPath("/api/store/order-history"), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`โหลดประวัติไม่สำเร็จ (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
  });

  /**
   * เซลล์อนุมัติ/ปฏิเสธระหว่างที่ร้านเปิดหน้านี้ค้างไว้ — เดิมการ์ดยังขึ้น "รออนุมัติ"
   * ต่อไปจนกว่าร้านจะกด reload เอง ทั้งที่กระดิ่งข้างบนขึ้นเลขแจ้งเตือนใหม่แล้ว
   * ข้อมูลบนจอเดียวกันจึงขัดกันเอง
   *
   * กระดิ่ง poll ทุก 60 วิอยู่แล้ว — เกาะจำนวนที่ยังไม่อ่านของมัน แล้วดึงประวัติใหม่
   * เมื่อมีแจ้งเตือนเข้ามาจริง (ไม่ poll ประวัติเองซ้ำอีกชุด)
   */
  const { data: notiCount } = useQuery<{ unread: number }>({
    queryKey: ["store-notifications-count"],
    queryFn: async () => {
      const r = await apiFetch(appPath("/api/store/notifications?count=1"));
      if (!r.ok) return { unread: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const lastUnread = useRef<number | null>(null);
  useEffect(() => {
    const n = notiCount?.unread;
    if (n == null) return;
    if (lastUnread.current !== null && n !== lastUnread.current) {
      void queryClient.invalidateQueries({ queryKey: ["order-history"] });
    }
    lastUnread.current = n;
  }, [notiCount?.unread, queryClient]);

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiFetch(
        appPath(`/api/store/orders?orderId=${encodeURIComponent(orderId)}`),
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `ยกเลิกออเดอร์ไม่สำเร็จ (${res.status})`
        );
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ยกเลิกออเดอร์แล้ว", tone: "success" });
      void queryClient.invalidateQueries({ queryKey: ["order-history"] });
    },
    onError: (err) => {
      toast({
        title: "ยกเลิกไม่สำเร็จ",
        detail: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    },
  });

  /**
   * สั่งซ้ำ — เขียน draft ลง sessionStorage คีย์เดียวกับที่หน้า /stock กับ /order ใช้
   * แล้วพาไปหน้าสต็อกให้ตรวจจำนวนก่อนส่ง (ไม่ส่งออเดอร์ให้เองเพราะสต็อกเปลี่ยนไปแล้ว)
   */
  function reorder(order: OrderHistoryEntry) {
    const qtyMap: Record<string, number> = {};
    for (const item of order.items) {
      if (item.finalQty > 0) qtyMap[item.skuCode] = item.finalQty;
    }
    if (Object.keys(qtyMap).length === 0) {
      toast({ title: "ออเดอร์นี้ไม่มีรายการให้สั่งซ้ำ", tone: "warn" });
      return;
    }
    try {
      sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
      // draft ใส่แค่ skuId เพราะหน้า /stock ใช้แค่ฟิลด์นี้ตอนคืนค่าการเลือก
      // (แล้วมันเขียนทับด้วย draft เต็มจากข้อมูลสต็อกวันนี้ภายในเสี้ยววินาที
      //  — ยัด row เก่ากลับไปจะได้ราคา/CVD ของวันที่สั่ง ซึ่งไม่จริงแล้ว)
      sessionStorage.setItem(
        "vmi_order_draft",
        JSON.stringify(order.items.map((i) => ({ skuId: i.skuId })))
      );
      // ราคาที่เคยแก้ไว้ผูกกับ draft เดิม ต้องไม่ติดมากับออเดอร์ใหม่
      sessionStorage.removeItem("vmi_order_price");
    } catch {
      toast({ title: "เบราว์เซอร์ปิด sessionStorage อยู่", tone: "warn" });
      return;
    }
    toast({
      title: `เตรียมสั่งซ้ำ ${Object.keys(qtyMap).length} รายการ`,
      detail: "สินค้าที่ไม่มีในสต็อกวันนี้จะไม่ถูกเลือก — ตรวจอีกครั้งก่อนส่ง",
      tone: "info",
    });
    router.push("/stock");
  }

  const orders = useMemo(() => data?.orders ?? [], [data?.orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = dayFilter > 0 ? Date.now() - dayFilter * 86_400_000 : null;
    return orders.filter((o) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (cutoff != null && Date.parse(o.createdAt) < cutoff) return false;
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
  }, [orders, statusFilter, search, dayFilter]);

  // สรุปตามผลกรองที่เห็นอยู่ — ไม่งั้นเลือก "7 วัน" แล้วตัวเลขบนสุดยังเป็นทั้งหมด
  const stats = useMemo(() => {
    let totalQty = 0;
    let pending = 0;
    let approved = 0;
    let totalValue = 0;
    let hasValue = false;
    for (const o of filtered) {
      totalQty += o.totalQty;
      if (o.status === "pending_approval") pending++;
      if (o.status === "approved") approved++;
      if (o.orderTotal != null) {
        totalValue += o.orderTotal;
        hasValue = true;
      }
    }
    return {
      count: filtered.length,
      totalQty,
      pending,
      approved,
      totalValue: hasValue ? totalValue : null,
    };
  }, [filtered]);

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
        title={headerTitle}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      {/* การ์ดที่กางออกมีตาราง 6 คอลัมน์ + timeline — 1024px เดิมแคบไปบนจอ 1536px */}
      <main className="mx-auto w-full min-w-0 max-w-7xl space-y-3 px-3 py-3 sm:px-4">
        {/* ---- สรุป ---- */}
        {/* 5 ช่องเสมอ — เดิมเป็น 4 ช่องแล้วการ์ด "มูลค่ารวม" ตกไปอยู่บรรทัดใหม่ลำพัง */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
          {/* แสดงเสมอ ไม่ซ่อนตามเงื่อนไข — กริดจะได้ไม่กระโดดไปมา
              "—" = ไม่มีข้อมูลราคา (ออเดอร์เก่า) ซึ่งต่างจาก 0 บาท */}
          <SummaryTile
            icon={<Wallet className="h-4 w-4" />}
            label="มูลค่ารวม"
            value={
              stats.totalValue != null
                ? (formatBaht(stats.totalValue) ?? "—")
                : "—"
            }
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
          <div className="flex shrink-0 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
            {DAY_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setDayFilter(f.value)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  dayFilter === f.value
                    ? "bg-teal-600 text-white shadow-sm"
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
                            "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1",
                            meta.badge
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-xs text-slate-400">
                          {relativeTime(order.createdAt)}
                        </span>
                      </div>

                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {order.items
                          .slice(0, 3)
                          .map((i) => i.skuName)
                          .join(" · ")}
                        {order.items.length > 3 &&
                          ` +${order.items.length - 3} รายการ`}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {formatNumber(order.itemCount, 0)} รายการ
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                          <Boxes className="h-3 w-3" />
                          {formatNumber(order.totalQty, 0)} หีบ
                        </span>
                        {order.orderTotal != null && (
                          <span className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400">
                            <Wallet className="h-3 w-3" />
                            {formatBaht(order.orderTotal)}
                          </span>
                        )}
                        {order.approvedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            อนุมัติ {fmtDateTime(order.approvedAt)}
                          </span>
                        )}
                      </div>

                      {order.poNumbers && order.poNumbers.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            เลข PO
                          </span>
                          {order.poNumbers.map((po) => (
                            <span
                              key={po}
                              className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              title="ใช้อ้างอิงเวลาตามของกับฝ่ายจัดซื้อ"
                            >
                              {po}
                            </span>
                          ))}
                        </div>
                      )}

                      {/*
                        ปฏิเสธแล้วต้องบอกเสมอว่าเพราะอะไร — เหตุผลเป็นช่องที่ไม่บังคับ
                        ถ้าพนักงานไม่กรอก ร้านจะเห็นแค่ป้ายแดงแล้วเดาเองว่าทำอะไรผิด
                        บอกตรง ๆ ว่า "ไม่ได้ระบุ" ดีกว่าปล่อยว่างให้เข้าใจว่า UI ซ่อนอยู่
                      */}
                      {order.status === "rejected" && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                          <Trash2 className="mt-0.5 h-3 w-3 shrink-0" />
                          {order.rejectReason
                            ? `เหตุผลที่ปฏิเสธ: ${order.rejectReason}`
                            : "ถูกปฏิเสธ — พนักงานไม่ได้ระบุเหตุผล สอบถามเซลล์ที่ดูแลได้"}
                        </p>
                      )}
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      <OrderTimeline order={order} />

                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reorder(order)}
                          title="ตั้งจำนวนเดิมไว้ที่หน้าสต็อกเพื่อสั่งอีกครั้ง"
                        >
                          <RotateCcw className="h-4 w-4" />
                          สั่งซ้ำ
                        </Button>
                        {/* ยกเลิกได้เฉพาะที่พนักงานยังไม่แตะ — ตรงกับเงื่อนไขฝั่ง API */}
                        {order.status === "pending_approval" &&
                          order.poNumbers.length === 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                              onClick={() => setCancelTarget(order)}
                              disabled={cancelOrder.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                              ยกเลิกออเดอร์
                            </Button>
                          )}
                        {order.decidedBy && (
                          <span className="text-xs text-slate-400">
                            ดำเนินการโดย {order.decidedBy}
                          </span>
                        )}
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[34rem] text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                            <tr>
                              <th className="w-[14%] px-3 py-1.5 font-medium">
                                รหัส
                              </th>
                              <th className="w-[30%] px-3 py-1.5 font-medium">
                                ชื่อสินค้า
                              </th>
                              {/*
                                คอลัมน์นี้คือ suggestedQty = จำนวนที่ "ระบบแนะนำ"
                                หัวเดิมเขียนว่า "ขอ" ทำให้อ่านเป็นจำนวนที่ร้านขอไป
                                แล้วงงเมื่อเห็น "ขอ 0 · สั่งจริง 3" ทั้งที่ร้านสั่ง 3 จริง
                              */}
                              <th
                                className="px-3 py-1.5 text-right font-medium"
                                title="จำนวนที่ระบบคำนวณและแนะนำ ณ ตอนที่ร้านเปิดหน้าสั่งซื้อ"
                              >
                                ระบบแนะนำ (หีบ)
                              </th>
                              <th className="px-3 py-1.5 text-right font-medium">
                                สั่งจริง (หีบ)
                              </th>
                              <th className="px-3 py-1.5 font-medium">
                                โปรที่ได้
                              </th>
                              <th className="px-3 py-1.5 text-right font-medium">
                                ราคา/หีบ
                              </th>
                              <th className="px-3 py-1.5 text-right font-medium">
                                มูลค่า
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
                                    <span
                                      className="vmi-cell-text line-clamp-2 block"
                                      title={item.skuName}
                                    >
                                      {item.skuName}
                                    </span>
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
                                  <td className="px-3 py-1.5">
                                    {item.promoLabel ? (
                                      <span
                                        className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                                        title={
                                          item.pooledQty &&
                                          item.pooledQty > item.finalQty
                                            ? `นับรวมกลุ่มโปร ${formatNumber(item.pooledQty, 0)} หีบ`
                                            : undefined
                                        }
                                      >
                                        <Sparkles className="h-3 w-3" />
                                        {item.promoLabel}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 dark:text-slate-600">
                                        —
                                      </span>
                                    )}
                                  </td>
                                  <td
                                    className={cn(
                                      "px-3 py-1.5 text-right tabular-nums",
                                      item.priceFlagged
                                        ? "font-semibold text-amber-700 dark:text-amber-400"
                                        : "text-slate-600 dark:text-slate-300"
                                    )}
                                    title={
                                      item.priceSetBySales
                                        ? `พนักงานตั้งราคานี้ (ราคาระบบ ${
                                            formatBaht(item.c4UnitPrice) ?? "-"
                                          })`
                                        : item.priceFlagged
                                          ? `ราคาไม่ตรงระบบ (${
                                              formatBaht(item.c4UnitPrice) ?? "-"
                                            })`
                                          : undefined
                                    }
                                  >
                                    {formatBaht(item.netUnitPrice) ?? "-"}
                                    {item.priceSetBySales && (
                                      <span className="ml-1 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                                        (พนักงาน)
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                    {formatBaht(item.lineTotal) ?? "-"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {order.orderTotal != null && (
                            <tfoot>
                              <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                                <td
                                  colSpan={6}
                                  className="px-3 py-1.5 text-right font-medium text-slate-500 dark:text-slate-400"
                                >
                                  รวมทั้งออเดอร์
                                </td>
                                <td className="px-3 py-1.5 text-right font-bold tabular-nums text-teal-700 dark:text-teal-400">
                                  {formatBaht(order.orderTotal)}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>

                      {/* dedupe มาจาก API แล้ว — โปรกลุ่มติดของแถมมาทุกบรรทัด ห้ามบวกจากตารางเอง */}
                      {order.freeGoods.length > 0 && (
                        <div className="border-t border-slate-100 bg-violet-50/40 px-3 py-2.5 dark:border-slate-800 dark:bg-violet-950/20">
                          <p className="flex items-center gap-1.5 text-xs font-bold text-violet-900 dark:text-violet-200">
                            <Gift className="h-3.5 w-3.5" />
                            ของแถมที่ควรได้
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {order.freeGoods.map((fg) => (
                              <li
                                key={`${fg.promoGroup ?? ""}-${fg.code}`}
                                className="flex items-baseline justify-between gap-2 text-xs"
                              >
                                <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                                  <span className="font-mono text-violet-700 dark:text-violet-300">
                                    {fg.code}
                                  </span>{" "}
                                  {fg.name}
                                  {fg.promoGroup && (
                                    <span
                                      className="ml-1 text-slate-400"
                                      title={groupTooltip(fg.promoGroup)}
                                    >
                                      · {groupLabel(fg.promoGroup)}
                                    </span>
                                  )}
                                </span>
                                <span className="shrink-0 font-bold tabular-nums text-violet-800 dark:text-violet-200">
                                  {formatNumber(fg.qty, 0)}
                                  {fg.unit ? ` ${fg.unit}` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
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

        <p className="flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
          <Wallet className="mt-0.5 h-3 w-3 shrink-0" />
          จำนวนที่แสดงเป็นหน่วยหีบ · ออเดอร์ก่อน 30 ก.ค. 2569 บันทึกเป็นหน่วยชิ้น
          ตัวเลขอาจดูสูงกว่าปกติ
        </p>
      </main>

      <ConfirmDialog
        open={cancelTarget != null}
        title="ยกเลิกออเดอร์นี้?"
        body={
          cancelTarget ? (
            <>
              ออเดอร์ {formatNumber(cancelTarget.itemCount, 0)} รายการ ·{" "}
              {formatNumber(cancelTarget.totalQty, 0)} หีบ ที่ส่งเมื่อ{" "}
              {fmtDateTime(cancelTarget.createdAt)}
              <br />
              ลบแล้วกู้คืนไม่ได้ และพนักงานขายจะได้รับแจ้ง
            </>
          ) : null
        }
        confirmLabel="ยกเลิกออเดอร์"
        cancelLabel="ไม่ใช่ตอนนี้"
        onConfirm={async () => {
          if (!cancelTarget) return;
          // error แจ้งผ่าน toast ใน onError อยู่แล้ว — ต้อง catch ไม่งั้น
          // ConfirmDialog จะค้างเปิดพร้อม unhandled rejection
          await cancelOrder.mutateAsync(cancelTarget.id).catch(() => {});
        }}
        onClose={() => setCancelTarget(null)}
      />
    </PageShell>
  );
}
