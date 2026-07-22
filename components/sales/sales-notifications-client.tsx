"use client";

import { appPath } from "@/lib/paths";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Loader2, Store } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SalesNav } from "./sales-nav";

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
  const [acking, setAcking] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<{
    items: NotiItem[];
    unseenCount: number;
  }>({
    queryKey: ["sales-notifications"],
    queryFn: async () => {
      const res = await fetch(appPath("/api/sales/notifications"));
      if (!res.ok) throw new Error(`โหลดการแจ้งเตือนไม่สำเร็จ (${res.status})`);
      return (await res.json()) as { items: NotiItem[]; unseenCount: number };
    },
  });

  const items = data?.items ?? [];
  const unseen = data?.unseenCount ?? 0;

  async function ack(ids?: string[]) {
    setAcking(true);
    try {
      await fetch(appPath("/api/sales/notifications"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
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
        subtitle="รายการหยุดสั่งจากร้านค้าที่คุณดูแล"
        role="sales"
      />
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
        <SalesNav />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Ban className="h-4 w-4 text-red-500" />
              รายการหยุดสั่ง
              {unseen > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  ใหม่ {unseen}
                </span>
              )}
            </h2>
            {unseen > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => ack()}
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
            <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด...</p>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-red-600 dark:text-red-400">
              <span>โหลดการแจ้งเตือนไม่สำเร็จ</span>
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                ลองใหม่
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
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
                          <span className="ml-1 font-mono text-[10px] text-slate-400">
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
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        เริ่มหยุด {fmt(n.effectiveFrom)} · แจ้งเมื่อ{" "}
                        {fmt(n.createdAt)}
                      </p>
                    </div>
                    {!n.acknowledged && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => ack([n.id])}
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
