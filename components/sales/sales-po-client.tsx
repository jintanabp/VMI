"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Search } from "lucide-react";
import { appPath } from "@/lib/paths";
import { useSalesSession } from "@/hooks/use-sales-session";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { SalesNav } from "@/components/sales/sales-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import {
  MobileRow,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import { formatBaht, formatNumber } from "@/lib/calculations";
import { formatStoreLabel } from "@/lib/format-store-label";
import { cn } from "@/lib/utils";
import type { PurchaseOrderRow } from "@/app/api/sales/purchase-orders/route";

const KIND_LABEL: Record<string, string> = {
  c4: "ราคาตรง C4",
  override: "ราคาไม่ตรง C4",
  mixed: "ราคาผสม",
};

const KIND_CLASS: Record<string, string> = {
  c4: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  override:
    "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  mixed:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

const PRICE_KIND_TABS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "c4", label: "ตรง C4" },
  { value: "override", label: "ไม่ตรง C4" },
] as const;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadPo(poNumber: string, format: "xlsx" | "json") {
  const qs = format === "json" ? "?format=json" : "";
  const url = `${appPath(`/api/sales/purchase-orders/${encodeURIComponent(poNumber)}`)}${qs}`;
  window.open(url, "_blank", "noopener");
}

/**
 * PO ที่ออกแล้ว — ปลายทางของออเดอร์ที่อนุมัติ
 *
 * เดิมเลข PO ถูกสร้างแล้วหายไปในไฟล์ JSON ไม่มีหน้าให้ดูย้อนหลังเลย
 * หน้านี้ตอบคำถามที่พนักงานถามจริง: "PO ที่ออกไปวันนี้มีอะไร"
 * และ "ใบไหนที่ราคาไม่ตรง C4 ต้องตามเรื่องกับจัดซื้อ"
 */
export function SalesPoClient() {
  const { session } = useSalesSession();
  const [search, setSearch] = useState("");
  const [priceKind, setPriceKind] = useState<string>("all");

  const { data, isLoading, isError, refetch } = useQuery<{
    items: PurchaseOrderRow[];
    truncated: boolean;
  }>({
    queryKey: ["sales-purchase-orders", priceKind],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (priceKind !== "all") params.set("priceKind", priceKind);
      const qs = params.toString();
      const res = await fetch(
        `${appPath("/api/sales/purchase-orders")}${qs ? `?${qs}` : ""}`
      );
      if (!res.ok) throw new Error(`โหลด PO ไม่สำเร็จ (${res.status})`);
      return res.json();
    },
    enabled: Boolean(session),
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(q) ||
        po.storeCode.toLowerCase().includes(q) ||
        po.storeName.toLowerCase().includes(q)
    );
  }, [data?.items, search]);

  const stats = useMemo(() => {
    let qty = 0;
    let amount = 0;
    let flagged = 0;
    for (const po of items) {
      qty += po.totalQty;
      amount += po.totalAmount;
      if (po.priceKind !== "c4") flagged++;
    }
    return { count: items.length, qty, amount, flagged };
  }, [items]);

  return (
    <PageShell>
      <AppHeader
        compact
        title="ใบสั่งซื้อ (PO)"
        subtitle="PO ที่ออกจากออเดอร์ที่อนุมัติแล้ว"
        role="sales"
      />

      <main className="mx-auto w-full max-w-6xl space-y-3 px-3 py-3 sm:px-4">
        <SalesNav />

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="PO ทั้งหมด"
            value={formatNumber(stats.count, 0)}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="รวม (หีบ)"
            value={formatNumber(stats.qty, 0)}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="มูลค่ารวม"
            value={formatBaht(stats.amount)}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="ราคาไม่ตรง C4"
            value={formatNumber(stats.flagged, 0)}
            tone={stats.flagged > 0 ? "amber" : "default"}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหาเลข PO / รหัสคลัง / ชื่อร้าน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div
            role="group"
            aria-label="กรองตามราคา"
            className="flex shrink-0 rounded-xl border border-slate-200 p-1 dark:border-slate-700"
          >
            {PRICE_KIND_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setPriceKind(t.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  priceKind === t.value
                    ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด...</p>
        )}
        {isError && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <span>โหลด PO ไม่สำเร็จ</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              ลองใหม่
            </Button>
          </div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              ยังไม่มี PO ที่ออก
            </p>
            <p className="mt-1 text-xs text-slate-500">
              PO จะถูกสร้างเมื่ออนุมัติออเดอร์ที่หน้า &quot;ตรวจออเดอร์&quot;
            </p>
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* เดสก์ท็อป */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 lg:block">
              <table className="vmi-data-table w-full text-left">
                <thead>
                  <tr>
                    <th className="px-3 py-2">เลข PO</th>
                    <th className="px-3 py-2">ร้าน / คลัง</th>
                    <th className="px-3 py-2">ประเภทราคา</th>
                    <th className="px-3 py-2 text-right">รายการ</th>
                    <th className="px-3 py-2 text-right">หีบ</th>
                    <th className="px-3 py-2 text-right">มูลค่า</th>
                    <th className="px-3 py-2">ออกเมื่อ</th>
                    <th className="px-3 py-2">โดย</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((po) => (
                    <tr
                      key={po.id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {po.poNumber}
                        </span>
                        {po.siblingCount > 1 && (
                          <span
                            className="ml-1.5 text-[10px] text-slate-400"
                            title={`ออเดอร์นี้แบ่งเป็น ${po.siblingCount} PO`}
                          >
                            แบ่ง {po.siblingCount} ใบ
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {formatStoreLabel(po.storeCode, po.storeName)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                            KIND_CLASS[po.priceKind] ?? KIND_CLASS.mixed
                          )}
                        >
                          {KIND_LABEL[po.priceKind] ?? po.priceKind}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(po.itemCount, 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(po.totalQty, 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatBaht(po.totalAmount)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {fmtDateTime(po.issuedAt)}
                      </td>
                      <td className="px-3 py-2 truncate text-slate-500">
                        {po.issuedBy || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => downloadPo(po.poNumber, "xlsx")}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Excel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            title="ดูข้อมูลดิบที่ส่งต่อฝ่ายจัดซื้อ"
                            onClick={() => downloadPo(po.poNumber, "json")}
                          >
                            JSON
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* มือถือ */}
            <MobileRowList grid className="lg:hidden">
              {items.map((po) => (
                <MobileRow key={po.id} warn={po.priceKind !== "c4"}>
                  <MobileRowTop>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                        {po.poNumber}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {formatStoreLabel(po.storeCode, po.storeName)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1",
                        KIND_CLASS[po.priceKind] ?? KIND_CLASS.mixed
                      )}
                    >
                      {KIND_LABEL[po.priceKind] ?? po.priceKind}
                    </span>
                  </MobileRowTop>
                  <MobileRowStats>
                    <MobileStat
                      label="รายการ"
                      value={formatNumber(po.itemCount, 0)}
                    />
                    <MobileStat
                      label="หีบ"
                      value={formatNumber(po.totalQty, 0)}
                      highlight
                    />
                    <MobileStat label="มูลค่า" value={formatBaht(po.totalAmount)} />
                    <MobileStat label="ออกเมื่อ" value={fmtDateTime(po.issuedAt)} />
                  </MobileRowStats>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-xs"
                      onClick={() => downloadPo(po.poNumber, "xlsx")}
                    >
                      <Download className="h-3.5 w-3.5" />
                      ดาวน์โหลด Excel
                    </Button>
                  </div>
                </MobileRow>
              ))}
            </MobileRowList>
          </>
        )}

        {data?.truncated && (
          <p className="text-center text-xs text-slate-400">
            แสดง 200 รายการล่าสุด — ใช้ช่องค้นหาเพื่อหาเลข PO ที่ต้องการ
          </p>
        )}
      </main>
    </PageShell>
  );
}
