"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShoppingCart, AlertTriangle, Package, TrendingDown } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { PromoDetailCell } from "@/components/promo/promo-detail-cell";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  MobileRow,
  MobileRowExtra,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import { cn } from "@/lib/utils";
import { formatDays, formatNumber } from "@/lib/calculations";
import {
  annotatePromoGroupStripes,
  promoGroupRowBgClass,
  sortRowsByPromoGroup,
  type PromoGroupStripe,
} from "@/lib/promo/promo-group-display";
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
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});

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

  const displayRows = useMemo(
    () => annotatePromoGroupStripes(sortRowsByPromoGroup(filtered)),
    [filtered]
  );

  /** จำนวนต่อ SKU สำหรับจำลอง promotion group (override จาก modal ได้) */
  const promoStagedQty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const o = qtyOverrides[r.skuCode];
      if (o != null && o > 0) {
        m[r.skuCode] = o;
      } else if (r.suggestOrder > 0) {
        m[r.skuCode] = r.suggestOrder;
      }
    }
    return m;
  }, [rows, qtyOverrides]);

  function applyGroupStaged(staged: Record<string, number>) {
    setQtyOverrides((prev) => ({ ...prev, ...staged }));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        const q = staged[r.skuCode];
        if (q != null && q > 0) next.add(r.skuId);
      }
      return next;
    });
  }

  useEffect(() => {
    if (Object.keys(qtyOverrides).length === 0) return;
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyOverrides));
  }, [qtyOverrides]);

  function toggleRow(skuId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  }

  const filteredNeedsOrder = useMemo(
    () => filtered.filter((r) => r.needsOrder),
    [filtered]
  );

  const allNeedsSelected =
    filteredNeedsOrder.length > 0 &&
    filteredNeedsOrder.every((r) => selected.has(r.skuId));

  const someNeedsSelected =
    filteredNeedsOrder.some((r) => selected.has(r.skuId)) && !allNeedsSelected;

  function toggleSelectAllNeeds() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allNeedsSelected) {
        filteredNeedsOrder.forEach((r) => next.delete(r.skuId));
      } else {
        filteredNeedsOrder.forEach((r) => next.add(r.skuId));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
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
    const qtyMap: Record<string, number> = {};
    for (const item of selectedItems) {
      const q =
        qtyOverrides[item.skuCode] ??
        (item.suggestOrder > 0 ? item.suggestOrder : 1);
      qtyMap[item.skuCode] = q;
    }
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
  }, [selectedItems, qtyOverrides]);

  function goToOrder() {
    if (selectedItems.length === 0) return;
    sessionStorage.setItem("vmi_order_draft", JSON.stringify(selectedItems));
    const qtyMap: Record<string, number> = {};
    for (const item of selectedItems) {
      qtyMap[item.skuCode] =
        qtyOverrides[item.skuCode] ??
        (item.suggestOrder > 0 ? item.suggestOrder : 1);
    }
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
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
    <PageShell className="vmi-stock-page pb-20">
      <AppHeader
        compact
        title={`สต็อก · ${activeVda.toUpperCase()}`}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main className="vmi-stock-main mx-auto w-full min-w-0 max-w-7xl px-3 sm:px-4">
        <div className="vmi-stock-stats shrink-0 py-2 xl:py-3">
          <div className="flex gap-1.5 xl:hidden">
            <StockStatChip label="SKU" value={stats.total} />
            <StockStatChip
              label="ควรสั่ง"
              value={stats.needsOrder}
              tone="amber"
            />
            <StockStatChip
              label="CVDต่ำ"
              value={stats.lowStock}
              tone="red"
            />
          </div>
          <div className="hidden grid-cols-3 gap-2 xl:grid">
            <StatCard
              icon={<Package className="h-4 w-4 sm:h-5 sm:w-5" />}
              value={stats.total}
              label="SKU"
              className="!gap-2 !p-2.5 sm:!p-3"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />}
              value={stats.needsOrder}
              label="ควรสั่ง"
              tone="amber"
              className="!gap-2 !p-2.5 sm:!p-3"
            />
            <StatCard
              icon={<TrendingDown className="h-4 w-4 sm:h-5 sm:w-5" />}
              value={stats.lowStock}
              label="CVD ต่ำ"
              tone="red"
              className="!gap-2 !p-2.5 sm:!p-3"
            />
          </div>
        </div>

        <div className="vmi-stock-toolbar shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              className="h-8 pl-9 text-xs xl:h-9 xl:text-sm"
              placeholder="ค้นหา SKU หรือชื่อสินค้า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={selectAllNeedsOrder}
            >
              เลือกที่ควรสั่ง ({stats.needsOrder})
            </Button>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                ล้าง
              </Button>
            )}
          </div>
        </div>

        {selected.size > 0 && (
          <p className="mb-2 shrink-0 text-xs font-medium text-teal-700 dark:text-teal-400">
            เลือกแล้ว {selected.size} รายการ · หน่วย หีบ
          </p>
        )}

        <div className="vmi-table-wrap vmi-stock-table-wrap min-h-0 flex-1 max-xl:flex-none">
          <div className="vmi-table-scroll vmi-stock-table-scroll overflow-x-hidden xl:overflow-x-auto">
            <div className="xl:hidden">
              {isLoading ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  กำลังโหลด...
                </p>
              ) : (
                <MobileRowList>
                  {displayRows.map((row) => (
                    <StockMobileRow
                      key={row.skuId}
                      row={row}
                      storeCode={activeVda}
                      stagedQty={promoStagedQty}
                      onConfirmStaged={applyGroupStaged}
                      selected={selected.has(row.skuId)}
                      onToggle={() => toggleRow(row.skuId)}
                    />
                  ))}
                </MobileRowList>
              )}
            </div>

            <table className="vmi-data-table hidden w-full min-w-0 text-left xl:table xl:min-w-[1140px]">
            <thead className="text-xs font-medium text-slate-500 dark:text-slate-400">
              <tr>
                <th className="w-9 px-2 py-2 xl:w-10 xl:px-3 xl:py-2.5">
                  <Checkbox
                    checked={
                      allNeedsSelected
                        ? true
                        : someNeedsSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleSelectAllNeeds}
                    aria-label="เลือกรายการที่ควรสั่งทั้งหมดในตาราง"
                    title="เลือกรายการที่ควรสั่ง (ตามตัวกรอง)"
                  />
                </th>
                <th className="whitespace-nowrap px-2 py-2 xl:px-3 xl:py-2.5">SKU</th>
                <th className="px-2 py-2 xl:min-w-[140px] xl:px-3 xl:py-2.5">ชื่อ</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">สต็อก</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">ยอดขาย</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">CVD</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">MIN</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">MAX</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">แนะนำ</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">ราคา</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">ลด</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">สุทธิ</th>
                <th className="min-w-[160px] px-3 py-2.5">โปร</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!isLoading &&
                displayRows.map((row) => {
                  const lowStock =
                    row.needsOrder ||
                    (row.stockCvd !== null && row.stockCvd < 7);
                  return (
                    <tr
                      key={row.skuId}
                      className={cn(
                        "border-t border-slate-100 text-slate-800 transition-colors hover:bg-slate-50/60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/40",
                        promoGroupRowBgClass(row.promoGroupStripe),
                        lowStock && !row.promoGroupStripe && "bg-amber-100/80 dark:bg-amber-950/20",
                        selected.has(row.skuId) && "bg-teal-100/70 dark:bg-teal-950/25"
                      )}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selected.has(row.skuId)}
                          onCheckedChange={() => toggleRow(row.skuId)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                        {row.skuCode}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {row.skuName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatNumber(row.stock, 0)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(row.avgSales, 2)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
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
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {row.suggestOrder > 0 ? (
                          <span className="font-semibold text-amber-700 dark:text-amber-400">
                            {row.suggestOrder}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
                        <StockListPriceCell
                          unitPrice={row.unitPrice}
                          expired={row.priceExpired}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
                        <StockDiscountPerCaseCell
                          discountBaht={row.discountBahtPerCase}
                          discountPct={row.discountPctPerCase}
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
                        <StockNetPriceCell
                          unitPrice={row.unitPrice}
                          netUnitPrice={row.netUnitPrice}
                          expired={row.priceExpired}
                        />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <PromoDetailCell
                          variant="table"
                          currentPromo={row.currentPromo}
                          currentKind={row.currentPromoKind}
                          nextPromo={row.nextPromo}
                          qtyToNext={row.qtyToNext}
                          nextPromoQty={row.nextPromoQty}
                          nextKind={row.nextPromoKind}
                          hasPromoLadder={row.hasPromoLadder}
                          inspector={{
                            skuCode: row.skuCode,
                            storeCode: activeVda,
                            stagedQty: promoStagedQty,
                            promoGroup: row.promoGroup,
                            promoGroupMembers: row.promoGroupMembers,
                            onConfirmStaged: applyGroupStaged,
                          }}
                        />
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
      </main>

      <div className="vmi-action-bar">
        <div className="mx-auto flex max-w-7xl items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="hidden shrink-0 sm:inline-flex"
            onClick={selectAllNeedsOrder}
          >
            เลือกที่ควรสั่ง
          </Button>
          <p className="min-w-0 flex-1 truncate text-center text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            {selected.size > 0 ? (
              <>
                <span className="font-semibold text-teal-700 dark:text-teal-400">
                  {selected.size}
                </span>{" "}
                รายการพร้อมสั่ง
              </>
            ) : (
              <>เลือกสินค้าจากตาราง หรือกด &quot;เลือกที่ควรสั่ง&quot;</>
            )}
          </p>
          <Button
            size="sm"
            className="shrink-0 sm:px-5"
            disabled={selected.size === 0}
            onClick={goToOrder}
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">สั่งสินค้า</span>
            <span className="sm:hidden">สั่ง</span>
            {selected.size > 0 && ` (${selected.size})`}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function StockMobileRow({
  row,
  storeCode,
  stagedQty,
  onConfirmStaged,
  selected,
  onToggle,
}: {
  row: StockRowComputed & { promoGroupStripe?: PromoGroupStripe | null };
  storeCode: string;
  stagedQty: Record<string, number>;
  onConfirmStaged: (staged: Record<string, number>) => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const lowStock =
    row.needsOrder || (row.stockCvd !== null && row.stockCvd < 7);
  const hasPromo =
    row.currentPromo ||
    row.nextPromo ||
    row.hasPromoLadder;

  return (
    <MobileRow
      selected={selected}
      warn={lowStock && row.promoGroupStripe == null}
      className={cn(
        promoGroupRowBgClass(row.promoGroupStripe ?? null),
        lowStock && !row.promoGroupStripe && "bg-amber-100/80 dark:bg-amber-950/20"
      )}
    >
      <MobileRowTop>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">
            <span className="text-teal-700 dark:text-teal-400">{row.skuCode}</span>
            <span className="mx-1.5 font-normal text-slate-300 dark:text-slate-600">
              ·
            </span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {row.skuName}
            </span>
          </p>
        </div>
      </MobileRowTop>
      <MobileRowStats className="pl-7">
        <MobileStat label="สต็อก" value={formatNumber(row.stock, 0)} />
        <MobileStat label="CVD" value={formatDays(row.stockCvd)} />
        {row.suggestOrder > 0 && (
          <MobileStat
            label="แนะนำ"
            value={`${row.suggestOrder} หีบ`}
            warn
          />
        )}
        <MobileStat label="ราคา">
          <StockListPriceCell
            unitPrice={row.unitPrice}
            expired={row.priceExpired}
            compact
          />
        </MobileStat>
        {(row.discountBahtPerCase != null && row.discountBahtPerCase > 0) ||
        (row.discountPctPerCase != null && row.discountPctPerCase > 0) ? (
          <MobileStat label="ลด">
            <StockDiscountPerCaseCell
              discountBaht={row.discountBahtPerCase}
              discountPct={row.discountPctPerCase}
              compact
            />
          </MobileStat>
        ) : null}
        <MobileStat label="สุทธิ">
          <StockNetPriceCell
            unitPrice={row.unitPrice}
            netUnitPrice={row.netUnitPrice}
            expired={row.priceExpired}
            compact
          />
        </MobileStat>
      </MobileRowStats>
      {hasPromo && (
        <MobileRowExtra className="pl-7">
          <PromoDetailCell
            variant="embedded"
            currentPromo={row.currentPromo}
            currentKind={row.currentPromoKind}
            nextPromo={row.nextPromo}
            qtyToNext={row.qtyToNext}
            nextPromoQty={row.nextPromoQty}
            nextKind={row.nextPromoKind}
            hasPromoLadder={row.hasPromoLadder}
            inspector={{
              skuCode: row.skuCode,
              storeCode,
              stagedQty,
              promoGroup: row.promoGroup,
              promoGroupMembers: row.promoGroupMembers,
              onConfirmStaged,
            }}
          />
        </MobileRowExtra>
      )}
    </MobileRow>
  );
}

function StockStatChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "amber" | "red";
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg bg-slate-100/80 px-2.5 py-1.5 text-xs dark:bg-slate-800/60">
      <span className="truncate text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={cn(
          "shrink-0 font-semibold tabular-nums",
          tone === "amber" && "text-amber-700 dark:text-amber-400",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "default" && "text-slate-800 dark:text-slate-100"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StockListPriceCell({
  unitPrice,
  expired,
  compact = false,
}: {
  unitPrice?: number | null;
  expired?: boolean;
  compact?: boolean;
}) {
  if (unitPrice == null) return <span className="text-slate-400">-</span>;
  return (
    <span
      className={cn(
        "font-medium text-slate-800 dark:text-slate-200",
        expired && "text-amber-600 dark:text-amber-400",
        compact && "text-xs"
      )}
      title={expired ? "ราคาในระบบหมดอายุ" : undefined}
    >
      {formatNumber(unitPrice, 0)}
    </span>
  );
}

function StockDiscountPerCaseCell({
  discountBaht,
  discountPct,
  compact = false,
}: {
  discountBaht?: number | null;
  discountPct?: number | null;
  compact?: boolean;
}) {
  if (discountBaht != null && discountBaht > 0) {
    return (
      <span className={cn("text-slate-600 dark:text-slate-400", compact && "text-xs")}>
        {formatNumber(discountBaht, 0)}
      </span>
    );
  }
  if (discountPct != null && discountPct > 0) {
    return (
      <span className={cn("text-slate-600 dark:text-slate-400", compact && "text-xs")}>
        {formatNumber(discountPct, 1)}%
      </span>
    );
  }
  return <span className="text-slate-300 dark:text-slate-600">—</span>;
}

function StockNetPriceCell({
  unitPrice,
  netUnitPrice,
  expired,
  compact = false,
}: {
  unitPrice?: number | null;
  netUnitPrice?: number | null;
  expired?: boolean;
  compact?: boolean;
}) {
  if (unitPrice == null) return <span className="text-slate-400">-</span>;
  const net = netUnitPrice ?? unitPrice;
  const hasDiscount = net < unitPrice - 0.001;
  return (
    <span
      className={cn(
        hasDiscount ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300",
        expired && !hasDiscount && "text-amber-600 dark:text-amber-400",
        compact && "text-xs"
      )}
      title={expired ? "ราคาในระบบหมดอายุ" : undefined}
    >
      {formatNumber(net, 0)}
    </span>
  );
}
