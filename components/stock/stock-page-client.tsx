"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShoppingCart, AlertTriangle, Package, TrendingDown, Gift, Percent, Sparkles, ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDays, formatNumber } from "@/lib/calculations";
import type { StockRowComputed } from "@/lib/repositories/types";

interface StockPageClientProps {
  storeCode: string;
  storeName: string;
  storeAddress?: string;
  isVda?: boolean;
}

interface StockApiResponse {
  sources: string[];
  activeFromDb: string | null;
  filterMode: string | null;
  rows: StockRowComputed[];
}

function isStockPayload(data: unknown): data is StockApiResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "rows" in data &&
    Array.isArray((data as StockApiResponse).rows)
  );
}

export function StockPageClient({
  storeCode,
  storeName,
  storeAddress,
  isVda = false,
}: StockPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editMin, setEditMin] = useState("");
  const [editMax, setEditMax] = useState("");

  const { data, isLoading } = useQuery<StockApiResponse>({
    queryKey: ["stock"],
    queryFn: async () => {
      const raw = await fetch("/api/stock").then((r) => r.json());
      if (isStockPayload(raw)) return raw;
      return {
        sources: [],
        activeFromDb: null,
        filterMode: null,
        rows: Array.isArray(raw) ? raw : [],
      };
    },
  });

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const activeVda = data?.activeFromDb ?? storeCode;

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      skuId: string;
      minDays: number;
      maxDays: number;
    }) => {
      const res = await fetch("/api/stock", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      setEditing(null);
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.skuCode.toLowerCase().includes(q) ||
        r.skuName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function toggleRow(skuId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  }

  function selectAllNeedsOrder() {
    setSelected(new Set(rows.filter((r) => r.needsOrder).map((r) => r.skuId)));
  }

  const stats = useMemo(() => {
    const needsOrder = rows.filter((r) => r.needsOrder).length;
    const lowStock = rows.filter(
      (r) => r.stockCvd !== null && r.stockCvd < 7
    ).length;
    return { total: rows.length, needsOrder, lowStock };
  }, [rows]);

  const selectedItems = useMemo(
    () => rows.filter((r) => selected.has(r.skuId)),
    [rows, selected]
  );

  useEffect(() => {
    if (selectedItems.length === 0) return;
    sessionStorage.setItem("vmi_order_draft", JSON.stringify(selectedItems));
  }, [selectedItems]);

  function goToOrder() {
    if (selectedItems.length === 0) return;
    sessionStorage.setItem("vmi_order_draft", JSON.stringify(selectedItems));
    router.push("/order");
  }

  function startEdit(row: StockRowComputed) {
    setEditing(row.skuId);
    setEditMin(String(row.minDays));
    setEditMax(String(row.maxDays));
  }

  function saveEdit(skuId: string) {
    updateMutation.mutate({
      skuId,
      minDays: Number(editMin),
      maxDays: Number(editMax),
    });
  }

  return (
    <PageShell customerNav>
      <AppHeader
        title="สต็อกสินค้าคงเหลือ"
        subtitle={isVda ? `คลัง ${activeVda.toUpperCase()} · หน่วย: หีบ` : "หน่วย: หีบ"}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
        actions={
          selected.size > 0 ? (
            <Button onClick={goToOrder}>
              <ShoppingCart className="h-4 w-4" />
              สั่งสินค้า ({selected.size})
            </Button>
          ) : undefined
        }
      />

      <main
        className={cn(
          "mx-auto w-full min-w-0 max-w-7xl px-3 py-4 sm:px-4 sm:py-6",
          selected.size > 0 && "pb-28"
        )}
      >
        <div className="mb-4 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-3 lg:gap-4">
          <StatCard
            icon={<Package className="h-5 w-5 lg:h-6 lg:w-6" />}
            value={stats.total}
            label="รายการ SKU"
            className="!gap-3 !p-3 lg:!gap-4 lg:!p-4"
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5 lg:h-6 lg:w-6" />}
            value={stats.needsOrder}
            label="ควรสั่งเพิ่ม"
            tone="amber"
            className="!gap-3 !p-3 lg:!gap-4 lg:!p-4"
          />
          <StatCard
            icon={<TrendingDown className="h-5 w-5 lg:h-6 lg:w-6" />}
            value={stats.lowStock}
            label="CVD ต่ำ (<7 วัน)"
            tone="red"
            className="col-span-2 lg:col-span-1 !gap-3 !p-3 lg:!gap-4 lg:!p-4"
          />
        </div>

        <div className="vmi-card mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              className="pl-9"
              placeholder="ค้นหา SKU หรือชื่อสินค้า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="w-full shrink-0 whitespace-nowrap sm:w-auto"
            onClick={selectAllNeedsOrder}
          >
            เลือกทั้งหมดที่ควรสั่ง
          </Button>
        </div>

        <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
          เลื่อนตารางเพื่อดูข้อมูลทั้งหมด · หัวตารางตรึงไว้ตลอด
        </p>

        <div className="vmi-table-wrap">
          <div className="vmi-table-scroll">
          <table className="w-full min-w-[1020px] text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-3 py-3">เลือก</th>
                <th className="px-3 py-3">SKU</th>
                <th className="min-w-[140px] px-3 py-3">ชื่อสินค้า</th>
                <th className="px-3 py-3 text-right">สต็อก</th>
                <th className="px-3 py-3 text-right">ยอดขายเฉลี่ย</th>
                <th className="px-3 py-3 text-right">CVD</th>
                <th className="px-3 py-3 text-right">MIN</th>
                <th className="px-3 py-3 text-right">MAX</th>
                <th className="px-3 py-3 text-right">แนะนำ</th>
                <th className="px-3 py-3 text-right">ราคา/หีบ</th>
                <th className="min-w-[200px] px-3 py-3">โปรโมชัน</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!isLoading &&
                filtered.map((row) => {
                  const lowStock =
                    row.needsOrder ||
                    (row.stockCvd !== null && row.stockCvd < 7);
                  return (
                    <tr
                      key={row.skuId}
                      className={cn(
                        "border-t border-slate-100 text-slate-800 transition-colors hover:bg-slate-50/80 dark:border-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-800/60",
                        lowStock && "bg-amber-50/60 dark:bg-amber-950/30",
                        selected.has(row.skuId) && "bg-teal-50/50 dark:bg-teal-950/35"
                      )}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.has(row.skuId)}
                          onCheckedChange={() => toggleRow(row.skuId)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.skuCode}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.skuName}</td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(row.stock, 0)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(row.avgSales, 2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatDays(row.stockCvd)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editing === row.skuId ? (
                          <Input
                            className="h-8 w-16 text-right"
                            value={editMin}
                            onChange={(e) => setEditMin(e.target.value)}
                          />
                        ) : (
                          <button
                            className="rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-300"
                            onClick={() => startEdit(row)}
                            title="คลิกเพื่อแก้ MIN (วัน)"
                          >
                            {formatNumber(row.minStock, 0)}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editing === row.skuId ? (
                          <Input
                            className="h-8 w-16 text-right"
                            value={editMax}
                            onChange={(e) => setEditMax(e.target.value)}
                          />
                        ) : (
                          <button
                            className="rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-700 dark:text-slate-300"
                            onClick={() => startEdit(row)}
                            title="คลิกเพื่อแก้ MAX (วัน)"
                          >
                            {formatNumber(row.maxStock, 0)}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.suggestOrder > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-100 to-orange-100 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200 dark:from-amber-900/50 dark:to-orange-900/40 dark:text-amber-300 dark:ring-amber-700/60">
                            {row.suggestOrder} หีบ
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        <StockPriceCell
                          unitPrice={row.unitPrice}
                          netUnitPrice={row.netUnitPrice}
                          expired={row.priceExpired}
                        />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <StockPromoColumn row={row} />
                      </td>
                      {editing === row.skuId && (
                        <td className="px-3 py-2">
                          <Button size="sm" onClick={() => saveEdit(row.skuId)}>
                            บันทึก
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="vmi-sticky-bar fixed inset-x-0 bottom-14 z-[60] px-4 py-3 md:bottom-0">
            <div className="mx-auto flex w-full max-w-2xl justify-center">
              <Button
                type="button"
                size="lg"
                asChild
                className="vmi-fab w-full max-w-xl shadow-lg sm:w-auto sm:px-8"
              >
                <Link
                  href="/order"
                  onClick={(e) => {
                    if (selectedItems.length === 0) {
                      e.preventDefault();
                      return;
                    }
                    sessionStorage.setItem(
                      "vmi_order_draft",
                      JSON.stringify(selectedItems)
                    );
                  }}
                >
                  <ShoppingCart className="h-5 w-5" />
                  เลือก {selected.size} รายการ → ดำเนินการสั่งสินค้า
                </Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </PageShell>
  );
}

function StockPromoColumn({ row }: { row: StockRowComputed }) {
  const hasCurrent = Boolean(row.currentPromo);
  const hasNext =
    Boolean(row.nextPromo) && (row.qtyToNext ?? 0) > 0;

  if (!hasCurrent && !hasNext) {
    return <span className="text-slate-300 dark:text-slate-600">—</span>;
  }

  const kind = row.currentPromoKind;
  const isPremium = kind === "premium";
  const isDiscount = kind === "discount_baht" || kind === "discount_pct";

  return (
    <div className="flex max-w-[260px] flex-col gap-1.5">
      {hasCurrent && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-2.5 py-2",
            isPremium &&
              "border-violet-200/80 bg-violet-50 dark:border-violet-800/50 dark:bg-violet-950/40",
            isDiscount &&
              "border-emerald-200/80 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/35",
            !isPremium &&
              !isDiscount &&
              "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
              isPremium && "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
              isDiscount && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
              !isPremium && !isDiscount && "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            )}
          >
            {isPremium ? (
              <Gift className="h-3 w-3" />
            ) : isDiscount ? (
              <Percent className="h-3 w-3" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {isPremium ? "ของแถม" : isDiscount ? "ส่วนลด" : "โปร"}
            </p>
            <p
              className={cn(
                "mt-0.5 text-xs font-medium leading-snug",
                isPremium && "text-violet-900 dark:text-violet-200",
                isDiscount && "text-emerald-900 dark:text-emerald-200",
                !isPremium && !isDiscount && "text-slate-800 dark:text-slate-200"
              )}
            >
              {row.currentPromo}
            </p>
          </div>
        </div>
      )}
      {hasNext && (
        <div className="flex items-start gap-1.5 rounded-md bg-sky-50 px-2 py-1.5 dark:bg-sky-950/30">
          <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <p className="text-[11px] leading-snug text-sky-800 dark:text-sky-300">
            <span className="font-semibold">อีก {row.qtyToNext} หีบ</span>
            <span className="text-sky-600 dark:text-sky-400"> → </span>
            {row.nextPromo}
          </p>
        </div>
      )}
    </div>
  );
}

function StockPriceCell({
  unitPrice,
  netUnitPrice,
  expired,
}: {
  unitPrice?: number | null;
  netUnitPrice?: number | null;
  expired?: boolean;
}) {
  if (unitPrice == null) return <span className="text-slate-400">-</span>;
  const hasDiscount =
    netUnitPrice != null && netUnitPrice < unitPrice - 0.001;
  return (
    <span className={cn(expired && "text-amber-600 dark:text-amber-400")}>
      {hasDiscount ? (
        <>
          <span className="text-slate-400 line-through">
            {formatNumber(unitPrice, 0)}
          </span>{" "}
          <span className="font-semibold text-teal-700 dark:text-teal-400">
            {formatNumber(netUnitPrice!, 0)}
          </span>
        </>
      ) : (
        formatNumber(unitPrice, 0)
      )}
    </span>
  );
}
