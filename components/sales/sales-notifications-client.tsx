"use client";

import { appPath } from "@/lib/paths";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  Loader2,
  PackagePlus,
  Store,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SalesNav } from "./sales-nav";
import { apiFetch } from "@/lib/api-fetch";

interface NotiItem {
  id: string;
  storeCode: string;
  storeName: string;
  skuCode: string;
  skuName: string;
  reason: string;
  effectiveFrom: string;
  createdAt: string;
  acknowledged: boolean;
}

interface OrderNotiItem {
  id: string;
  kind: string;
  title: string;
  detail: string;
  orderId: string | null;
  storeCode: string;
  storeName: string;
  createdAt: string;
  acknowledged: boolean;
}

interface NotiResponse {
  items: NotiItem[];
  orderItems: OrderNotiItem[];
  blockUnseenCount: number;
  orderUnseenCount: number;
  unseenCount: number;
}

const ORDER_KIND_META: Record<
  string,
  { label: string; icon: typeof PackagePlus; className: string }
> = {
  order_created: {
    label: "ออเดอร์ใหม่",
    icon: PackagePlus,
    className: "text-teal-600 dark:text-teal-400",
  },
  order_cancelled: {
    label: "ร้านยกเลิก",
    icon: Trash2,
    className: "text-red-600 dark:text-red-400",
  },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SalesNotificationsClient() {
  const qc = useQueryClient();
  const router = useRouter();
  const [acking, setAcking] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<NotiResponse>({
    queryKey: ["sales-notifications"],
    queryFn: async () => {
      const res = await apiFetch(appPath("/api/sales/notifications"));
      if (!res.ok) throw new Error(`โหลดการแจ้งเตือนไม่สำเร็จ (${res.status})`);
      return (await res.json()) as NotiResponse;
    },
    // ออเดอร์ใหม่เข้ามาได้ตลอดวัน — รอบเดียวกับ badge บนเมนู
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];
  const orderItems = data?.orderItems ?? [];
  const blockUnseen = data?.blockUnseenCount ?? 0;
  const orderUnseen = data?.orderUnseenCount ?? 0;

  /**
   * เปิดหน้านี้ = เห็นออเดอร์ใหม่แล้ว จึงรับทราบให้อัตโนมัติ
   *
   * ทำเฉพาะ "ออเดอร์จากร้าน" ซึ่งเป็นข้อมูลแจ้งให้ทราบเฉย ๆ
   * **ไม่แตะ "รายการหยุดสั่ง"** เพราะการรับทราบตรงนั้นหมายถึงยืนยันว่าเห็นแล้วว่า
   * สินค้าตัวนี้ห้ามสั่ง — เป็นการตัดสินใจของคน ระบบไม่ควรกดแทน
   */
  useEffect(() => {
    if (orderUnseen === 0 || acking) return;
    const t = setTimeout(() => void ack("order"), 1_500);
    return () => clearTimeout(t);
    // ผูกกับจำนวนที่ยังไม่รับทราบพอ — ack เปลี่ยน identity ทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderUnseen]);

  async function ack(type: "block" | "order", ids?: string[]) {
    setAcking(true);
    try {
      await apiFetch(appPath("/api/sales/notifications"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...(ids ? { ids } : {}) }),
      });
      // SalesNav ใช้ queryKey เดียวกัน — badge บนเมนูอัปเดตตามไปด้วย
      await qc.invalidateQueries({ queryKey: ["sales-notifications"] });
    } finally {
      setAcking(false);
    }
  }

  return (
    <PageShell>
      <AppHeader
        compact
        title="การแจ้งเตือน"
        subtitle="ออเดอร์ใหม่และรายการหยุดสั่งจากร้านที่คุณดูแล"
        role="sales"
      />
      {/* รายการอ่าน — ขยายพอให้ไม่เสียพื้นที่ แต่ไม่เต็มจอ บรรทัดยาวเกินอ่านยาก */}
      <main className="mx-auto w-full max-w-5xl space-y-3 px-3 py-4 sm:px-4">
        <SalesNav />

        {isError && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-red-200 bg-red-50 py-8 text-center text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
            <span>โหลดการแจ้งเตือนไม่สำเร็จ</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* ออเดอร์จากร้าน — เรื่องที่ต้องลงมือต่อ จึงอยู่บนสุด */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <PackagePlus className="h-4 w-4 text-teal-500" />
              ออเดอร์จากร้าน
              {orderUnseen > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  ใหม่ {orderUnseen}
                </span>
              )}
            </h2>
            {orderUnseen > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => ack("order")}
                disabled={acking}
              >
                {acking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                รับทราบทั้งหมด
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              กำลังโหลด...
            </p>
          ) : orderItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              ยังไม่มีออเดอร์ใหม่
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {orderItems.map((n) => {
                const meta = ORDER_KIND_META[n.kind] ?? ORDER_KIND_META.order_created;
                const Icon = meta.icon;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "rounded-xl border p-3",
                      n.acknowledged
                        ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                        : "border-teal-200 bg-teal-50/50 dark:border-teal-900/50 dark:bg-teal-950/20"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                          <Icon
                            className={cn("h-3.5 w-3.5 shrink-0", meta.className)}
                          />
                          <span className={cn("shrink-0", meta.className)}>
                            {meta.label}
                          </span>
                          <span className="truncate text-slate-500">
                            {n.storeName}
                            <span className="ml-1 font-mono text-[11px] text-slate-400">
                              {n.storeCode}
                            </span>
                          </span>
                        </p>
                        <p className="mt-1 truncate text-sm text-slate-900 dark:text-slate-100">
                          {n.title}
                        </p>
                        {n.detail && (
                          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                            {n.detail}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-slate-400">
                          {fmt(n.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {n.kind === "order_created" && n.orderId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push("/sales/orders")}
                            title="ไปหน้าตรวจออเดอร์"
                          >
                            ตรวจ
                          </Button>
                        )}
                        {!n.acknowledged && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => ack("order", [n.id])}
                            disabled={acking}
                            title="รับทราบ"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Ban className="h-4 w-4 text-red-500" />
              รายการหยุดสั่ง
              {blockUnseen > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  ใหม่ {blockUnseen}
                </span>
              )}
            </h2>
            {blockUnseen > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => ack("block")}
                disabled={acking}
              >
                {acking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                รับทราบทั้งหมด
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              กำลังโหลด...
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              ยังไม่มีรายการหยุดสั่ง
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "rounded-xl border p-3",
                    n.acknowledged
                      ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      : "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">
                          {n.storeName}
                          <span className="ml-1 font-mono text-[11px] text-slate-400">
                            {n.storeCode}
                          </span>
                        </span>
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-teal-700 dark:text-teal-400">
                          {n.skuCode}
                        </span>{" "}
                        {n.skuName}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        เหตุผล: {n.reason}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        เริ่มหยุด {fmt(n.effectiveFrom)} · แจ้งเมื่อ{" "}
                        {fmt(n.createdAt)}
                      </p>
                    </div>
                    {!n.acknowledged && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => ack("block", [n.id])}
                        disabled={acking}
                        title="รับทราบ"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </PageShell>
  );
}
