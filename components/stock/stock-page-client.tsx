"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  ShoppingCart,
  BarChart3,
  Clock,
  RefreshCw,
  Filter,
  Package,
  Boxes,
  Wallet,
  CalendarClock,
  X,
  Check,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { PromoDetailCell } from "@/components/promo/promo-detail-cell";
import { ProductSalesPanel } from "@/components/stock/product-sales-panel";
import {
  StockDiscountPerCaseCell,
  StockListPriceCell,
  StockNetPriceCell,
} from "@/components/stock/stock-price-cells";
import { FlagBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  calcCvdEstimate,
  formatDays,
  formatNumber,
  getCvdFlag,
  type CvdFlag,
} from "@/lib/calculations";
import {
  annotatePromoGroupStripes,
  promoGroupBadgeClass,
  promoGroupRowBgClass,
  sortRowsByPromoGroup,
  type PromoGroupStripe,
} from "@/lib/promo/promo-group-display";
import { enrichStockRowsWithPooledPromo } from "@/lib/promo/stock-pooled-promo";
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
  dataDate: string | null;
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

type ViewScope = { needsOnly: boolean; brand: string | null; section: string | null };

type DisplayRow = StockRowComputed & {
  promoGroupStripe?: PromoGroupStripe | null;
  promoGroupIsFirst?: boolean;
};

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
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewScope, setViewScope] = useState<ViewScope>({
    needsOnly: false,
    brand: null,
    section: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [sessionReady, setSessionReady] = useState(false);

  const { data, isLoading } = useQuery<StockApiResponse>({
    queryKey: ["stock"],
    queryFn: async () => {
      const raw = await fetch("/api/stock").then((r) => r.json());
      if (isStockPayload(raw)) return raw;
      return {
        sources: [],
        activeFromDb: null,
        filterMode: null,
        dataDate: null,
        rows: Array.isArray(raw) ? raw : [],
      };
    },
  });

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const activeVda = data?.activeFromDb ?? storeCode;
  const dataDate = data?.dataDate ?? null;

  /** คืนค่าการเลือก + จำนวนจาก session เมื่อกลับจากหน้า order */
  useEffect(() => {
    if (rows.length === 0 || sessionReady) return;
    try {
      const rawDraft = sessionStorage.getItem("vmi_order_draft");
      const rawQty = sessionStorage.getItem("vmi_order_qty");
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as StockRowComputed[];
        if (Array.isArray(draft) && draft.length > 0) {
          const ids = draft
            .map((r) => r.skuId)
            .filter((id) => rows.some((r) => r.skuId === id));
          if (ids.length > 0) setSelected(new Set(ids));
        }
      }
      if (rawQty) {
        const qtyMap = JSON.parse(rawQty) as Record<string, number>;
        if (qtyMap && typeof qtyMap === "object") {
          const valid: Record<string, number> = {};
          for (const r of rows) {
            const q = qtyMap[r.skuCode];
            if (q != null && q > 0) valid[r.skuCode] = Math.floor(q);
          }
          if (Object.keys(valid).length > 0) setQtyOverrides(valid);
        }
      }
    } catch {
      // ignore corrupt session
    } finally {
      setSessionReady(true);
    }
  }, [rows, sessionReady]);

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

  const enrichedRows = useMemo(
    () => enrichStockRowsWithPooledPromo(rows, promoStagedQty),
    [rows, promoStagedQty]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = enrichedRows;
    if (q) {
      out = out.filter((r) => r.skuName.toLowerCase().includes(q));
    }
    if (viewScope.needsOnly) {
      out = out.filter((r) => r.needsOrder);
    }
    if (viewScope.brand) {
      out = out.filter((r) => (r.brand ?? "") === viewScope.brand);
    }
    if (viewScope.section) {
      out = out.filter((r) => (r.section ?? "") === viewScope.section);
    }
    return out;
  }, [enrichedRows, search, viewScope]);

  function toggleExpand(skuId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  }

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await fetch("/api/stock/refresh", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || data.success === false) {
        setRefreshMsg(
          data.message ??
            data.error ??
            "ดึงข้อมูลจาก Fabric ไม่สำเร็จ — แสดง cache"
        );
      } else {
        setRefreshMsg(data.message ?? "อัปเดตข้อมูลแล้ว");
      }
    } catch {
      setRefreshMsg("รีเฟรชไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      setRefreshing(false);
    }
  }, [refreshing, queryClient]);

  const displayRows = useMemo(
    () => annotatePromoGroupStripes(sortRowsByPromoGroup(filtered)),
    [filtered]
  );

  function applyGroupStaged(staged: Record<string, number>) {
    setQtyOverrides((prev) => ({ ...prev, ...staged }));
  }

  const resolveLineQty = useCallback(
    (row: StockRowComputed) => {
      const o = qtyOverrides[row.skuCode];
      if (o != null) return Math.max(0, Math.floor(o));
      return row.suggestOrder > 0 ? row.suggestOrder : 0;
    },
    [qtyOverrides]
  );

  function defaultLineQty(row: StockRowComputed): number {
    return row.suggestOrder > 0 ? row.suggestOrder : 0;
  }

  function lineQty(row: StockRowComputed): number {
    return resolveLineQty(row);
  }

  /** จำนวนที่ใช้ประเมิน CVD — เฉพาะเมื่อมีการสั่งจริงหรือมีแนะนำ */
  function evalQty(row: StockRowComputed): number {
    const o = qtyOverrides[row.skuCode];
    if (o != null) return Math.max(0, Math.floor(o));
    if (selected.has(row.skuId)) return lineQty(row);
    if (row.suggestOrder > 0) return row.suggestOrder;
    return 0;
  }

  function orderCvdFlag(row: StockRowComputed): {
    cvdEst: number | null;
    flag: CvdFlag | null;
  } {
    const qty = evalQty(row);
    if (qty <= 0) return { cvdEst: null, flag: null };
    const cvdEst = calcCvdEstimate(row.stock, qty, row.avgSales);
    return { cvdEst, flag: getCvdFlag(cvdEst) };
  }

  /** ปรับจำนวนเท่านั้น — ไม่เลือกสินค้าให้อัตโนมัติ */
  function setLineQty(skuCode: string, qty: number) {
    const nextQty = Math.max(0, Math.floor(qty));
    setQtyOverrides((prev) => ({
      ...prev,
      [skuCode]: nextQty,
    }));
  }

  function adjustLineQty(skuCode: string, delta: number) {
    const row = rows.find((r) => r.skuCode === skuCode);
    if (!row) return;
    setLineQty(skuCode, lineQty(row) + delta);
  }

  function initQtyForRow(row: StockRowComputed) {
    setQtyOverrides((prev) => {
      if (prev[row.skuCode] != null) return prev;
      return {
        ...prev,
        [row.skuCode]: defaultLineQty(row),
      };
    });
  }

  function toggleRow(skuId: string) {
    const row = rows.find((r) => r.skuId === skuId);
    const adding = !selected.has(skuId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
    if (adding && row) initQtyForRow(row);
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
    if (allNeedsSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredNeedsOrder.forEach((r) => next.delete(r.skuId));
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      filteredNeedsOrder.forEach((r) => next.add(r.skuId));
      return next;
    });
    setQtyOverrides((prev) => {
      const next = { ...prev };
      for (const r of filteredNeedsOrder) {
        if (next[r.skuCode] == null) {
          next[r.skuCode] = r.suggestOrder > 0 ? r.suggestOrder : 0;
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  /** คืนจำนวนทุกรายการเป็นที่แนะนำ (ไม่เปลี่ยนการเลือก) */
  function resetAllQtyToSuggested() {
    setQtyOverrides({});
  }

  /** เลือกที่ควรสั่งตามตัวกรองปัจจุบัน (replace ไม่สะสม) */
  function selectByFilter(section?: string) {
    let target = filteredNeedsOrder;
    if (section) {
      target = target.filter((r) => (r.section ?? "") === section);
    }
    setSelected(new Set(target.map((r) => r.skuId)));
    setQtyOverrides((prev) => {
      const next = { ...prev };
      for (const r of target) {
        if (next[r.skuCode] == null) {
          next[r.skuCode] = r.suggestOrder > 0 ? r.suggestOrder : 0;
        }
      }
      return next;
    });
  }

  const hasActiveFilter =
    viewScope.needsOnly ||
    Boolean(viewScope.brand) ||
    Boolean(viewScope.section);

  /** รายการ Section / Brand สำหรับแผงกรอง */
  const filterSections = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.section) s.add(r.section);
    return [...s].sort((a, b) => a.localeCompare(b, "th"));
  }, [rows]);

  const filterBrands = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.brand) s.add(r.brand);
    return [...s].sort((a, b) => a.localeCompare(b, "th"));
  }, [rows]);

  const stats = useMemo(() => {
    let totalStock = 0;
    let totalValue = 0;
    let totalAvg = 0;
    let needsOrder = 0;
    for (const r of rows) {
      totalStock += r.stock;
      totalValue += r.stock * (r.unitPrice ?? 0);
      totalAvg += r.avgSales;
      if (r.needsOrder) needsOrder++;
    }
    const cvdAll = totalAvg > 0 ? totalStock / totalAvg : null;
    return {
      total: rows.length,
      totalStock,
      totalValue,
      cvdAll,
      needsOrder,
    };
  }, [rows]);

  const selectedItems = useMemo(
    () => rows.filter((r) => selected.has(r.skuId)),
    [rows, selected]
  );

  const selectedRedCount = useMemo(() => {
    let n = 0;
    for (const item of selectedItems) {
      const qty = resolveLineQty(item);
      if (qty <= 0) continue;
      if (getCvdFlag(calcCvdEstimate(item.stock, qty, item.avgSales)) === "red") {
        n++;
      }
    }
    return n;
  }, [selectedItems, resolveLineQty]);

  const selectedZeroQtyCount = useMemo(
    () => selectedItems.filter((item) => resolveLineQty(item) <= 0).length,
    [selectedItems, resolveLineQty]
  );

  useEffect(() => {
    if (!sessionReady) return;
    if (selectedItems.length === 0) {
      sessionStorage.removeItem("vmi_order_draft");
      sessionStorage.removeItem("vmi_order_qty");
      return;
    }
    sessionStorage.setItem("vmi_order_draft", JSON.stringify(selectedItems));
    const qtyMap: Record<string, number> = {};
    for (const item of selectedItems) {
      qtyMap[item.skuCode] = resolveLineQty(item);
    }
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
  }, [sessionReady, selectedItems, qtyOverrides, resolveLineQty]);

  function goToOrder() {
    if (selectedItems.length === 0) return;
    sessionStorage.setItem("vmi_order_draft", JSON.stringify(selectedItems));
    const qtyMap: Record<string, number> = {};
    for (const item of selectedItems) {
      qtyMap[item.skuCode] = resolveLineQty(item);
    }
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
    router.push("/order");
  }

  return (
    <PageShell className="vmi-stock-page pb-20">
      <AppHeader
        compact
        wide
        title={`สต็อก · ${activeVda.toUpperCase()}`}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main className="vmi-stock-main mx-auto w-full min-w-0 max-w-[88rem] px-3 sm:px-4">
        <div className="vmi-stock-stats shrink-0 py-2 xl:py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <StockStatCard
              icon={<Package className="h-4 w-4" />}
              label="จำนวน SKU"
              value={formatNumber(stats.total, 0)}
            />
            <StockStatCard
              icon={<Boxes className="h-4 w-4" />}
              label="หีบทั้งหมด"
              value={formatNumber(stats.totalStock, 0)}
            />
            <StockStatCard
              icon={<Wallet className="h-4 w-4" />}
              label="มูลค่าสินค้ารวม"
              value={`฿${formatNumber(stats.totalValue, 0)}`}
            />
            <StockStatCard
              icon={<CalendarClock className="h-4 w-4" />}
              label="CVD รวม"
              value={formatDays(stats.cvdAll)}
            />
            <StockStatCard
              icon={<ShoppingCart className="h-4 w-4" />}
              label="ควรสั่ง"
              value={formatNumber(stats.needsOrder, 0)}
              tone="amber"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              {dataDate ? (
                <p className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                  <Clock className="h-3 w-3" />
                  ข้อมูล ณ {formatDataDate(dataDate)}
                </p>
              ) : null}
              {refreshMsg && (
                <p
                  className={cn(
                    "mt-0.5 text-[11px]",
                    refreshMsg.includes("ไม่สำเร็จ") || refreshMsg.includes("cache")
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-teal-700 dark:text-teal-400"
                  )}
                >
                  {refreshMsg}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-slate-500 hover:text-teal-700 dark:text-slate-400"
              onClick={handleRefresh}
              disabled={refreshing}
              title="ดึงข้อมูลสินค้าล่าสุด"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? "กำลังรีเฟรช..." : "รีเฟรชข้อมูล"}
            </Button>
          </div>
        </div>

        <div className="vmi-stock-toolbar shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              className="h-8 pl-9 text-xs xl:h-9 xl:text-sm"
              placeholder="ค้นหาชื่อสินค้า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <StockFilterDropdown
              viewScope={viewScope}
              brands={filterBrands}
              sections={filterSections}
              filteredNeedsCount={filteredNeedsOrder.length}
              onChange={setViewScope}
              onSelect={() => selectByFilter()}
              onClear={() =>
                setViewScope({ needsOnly: false, brand: null, section: null })
              }
            />
            {filteredNeedsOrder.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => selectByFilter()}
              >
                เลือก {filteredNeedsOrder.length}
              </Button>
            )}
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                ล้าง
              </Button>
            )}
            {rows.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={resetAllQtyToSuggested}
                title="รีเซ็ตจำนวนทุกรายการกลับเป็นที่แนะนำ"
              >
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">รีเซ็ตแนะนำ</span>
              </Button>
            )}
          </div>
        </div>

        {hasActiveFilter && (
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              กำลังแสดง:
            </span>
            {viewScope.needsOnly && (
              <FilterChip label="ควรสั่ง" />
            )}
            {viewScope.brand && (
              <FilterChip label={`แบรนด์: ${viewScope.brand}`} />
            )}
            {viewScope.section && (
              <FilterChip label={`กลุ่มสินค้า: ${viewScope.section}`} />
            )}
            <button
              type="button"
              className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              onClick={() =>
                setViewScope({ needsOnly: false, brand: null, section: null })
              }
            >
              <X className="h-3 w-3" />
              ล้างกรอง
            </button>
          </div>
        )}

        {selected.size > 0 && (
          <p className="mb-2 shrink-0 text-xs font-medium text-teal-700 dark:text-teal-400">
            เลือกแล้ว {selected.size} รายการ · หน่วย หีบ
          </p>
        )}

        <div className="vmi-table-wrap vmi-stock-table-wrap min-h-0 flex-1 max-xl:flex-none">
          <div className="vmi-table-scroll vmi-stock-table-scroll overflow-x-hidden">
            <div className="xl:hidden">
              {isLoading ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  กำลังโหลด...
                </p>
              ) : (
                <MobileRowList grid>
                  {displayRows.map((row) => {
                    const { cvdEst, flag } = orderCvdFlag(row);
                    return (
                    <StockMobileRow
                      key={row.skuId}
                      row={row}
                      storeCode={activeVda}
                      qty={lineQty(row)}
                      selected={selected.has(row.skuId)}
                      orderCvd={cvdEst}
                      orderFlag={flag}
                      stagedQty={promoStagedQty}
                      onConfirmStaged={applyGroupStaged}
                      onAdjustQty={(d) => adjustLineQty(row.skuCode, d)}
                      onSetQty={(q) => setLineQty(row.skuCode, q)}
                      onApplySuggest={() =>
                        setLineQty(
                          row.skuCode,
                          row.suggestOrder > 0 ? row.suggestOrder : 0
                        )
                      }
                      onToggle={() => toggleRow(row.skuId)}
                      expanded={expanded.has(row.skuId)}
                      onToggleExpand={() => toggleExpand(row.skuId)}
                    />
                    );
                  })}
                </MobileRowList>
              )}
            </div>

            <table className="vmi-data-table vmi-stock-fit-table hidden w-full table-fixed text-left xl:table">
            <colgroup>
              <col className="w-[2.5%]" />
              <col className="w-[7%]" />
              <col className="w-[15%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[6%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[19.5%]" />
            </colgroup>
            <thead className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-1 py-2">
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
                <th className="px-1 py-2">SKU</th>
                <th className="px-1 py-2">ชื่อสินค้า</th>
                <th className="px-1 py-2 text-right">สต็อก</th>
                <th className="px-1 py-2 text-right">ขาย</th>
                <th className="px-1 py-2 text-right">CVD</th>
                <th className="px-1 py-2 text-right">MIN / MAX</th>
                <th className="px-1 py-2 text-center">จำนวนสั่ง</th>
                <th className="px-1 py-2 text-center">หลังสั่ง</th>
                <th className="px-1 py-2 text-right">ราคา/หีบ</th>
                <th className="px-1 py-2 text-right">ส่วนลด</th>
                <th className="px-1 py-2 text-right">ราคาสุทธิ/หีบ</th>
                <th className="px-1 py-2">โปร</th>
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
                  const isExpanded = expanded.has(row.skuId);
                  const { cvdEst, flag } = orderCvdFlag(row);
                  return (
                    <Fragment key={row.skuId}>
                    {row.promoGroupIsFirst && row.promoGroupStripe != null && (
                      <tr className="border-t border-slate-100 dark:border-slate-800">
                        <td colSpan={13} className="px-2 py-1">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1",
                              promoGroupBadgeClass(row.promoGroupStripe)
                            )}
                          >
                            กลุ่ม {row.promoGroup}
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr
                      className={cn(
                        "border-t border-slate-100 text-slate-800 transition-colors hover:bg-slate-50/60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/40",
                        promoGroupRowBgClass(row.promoGroupStripe),
                        lowStock && !row.promoGroupStripe && "bg-amber-100/80 dark:bg-amber-950/20",
                        selected.has(row.skuId) && "bg-teal-100/70 dark:bg-teal-950/25",
                        flag === "red" && "bg-red-50/70 dark:bg-red-950/25"
                      )}
                    >
                      <td className="px-1 py-1.5">
                        <Checkbox
                          checked={selected.has(row.skuId)}
                          onCheckedChange={() => toggleRow(row.skuId)}
                        />
                      </td>
                      <td className="truncate px-1 py-1.5 font-medium text-slate-900 dark:text-slate-100">
                        <div className="truncate text-xs">{row.skuCode}</div>
                        {row.barcode && (
                          <div className="truncate font-mono text-[9px] font-normal text-slate-400 dark:text-slate-500">
                            {row.barcode}
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-slate-700 dark:text-slate-300">
                        <button
                          type="button"
                          className={cn(
                            "group flex w-full min-w-0 items-center gap-1 text-left hover:text-teal-700 dark:hover:text-teal-400",
                            expanded.has(row.skuId) &&
                              "font-medium text-teal-700 dark:text-teal-400"
                          )}
                          onClick={() => toggleExpand(row.skuId)}
                          title={row.skuName}
                        >
                          <span className="min-w-0 truncate text-xs">{row.skuName}</span>
                          <BarChart3
                            className={cn(
                              "h-3 w-3 shrink-0 text-slate-300 group-hover:text-teal-600 dark:text-slate-600",
                              expanded.has(row.skuId) && "text-teal-600 dark:text-teal-400"
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-xs">
                        {formatNumber(row.stock, 0)}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-xs">
                        {formatNumber(row.avgSales, 1)}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-xs">
                        {formatDays(row.stockCvd)}
                      </td>
                      <td
                        className="px-1 py-1.5 text-right tabular-nums text-[11px] text-slate-500 dark:text-slate-400"
                        title={`MIN ${formatNumber(row.minStock, 0)} / MAX ${formatNumber(row.maxStock, 0)}`}
                      >
                        {formatNumber(row.minStock, 0)}/
                        {formatNumber(row.maxStock, 0)}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <StockQtyStepper
                          qty={lineQty(row)}
                          suggestOrder={row.suggestOrder}
                          onMinus={() => adjustLineQty(row.skuCode, -1)}
                          onPlus={() => adjustLineQty(row.skuCode, 1)}
                          onSetQty={(q) => setLineQty(row.skuCode, q)}
                          onApplySuggest={() =>
                            setLineQty(
                              row.skuCode,
                              row.suggestOrder > 0 ? row.suggestOrder : 0
                            )
                          }
                          compact
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {flag ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <FlagBadge flag={flag} compact />
                            <span
                              className={cn(
                                "text-[9px] tabular-nums",
                                flag === "red"
                                  ? "font-semibold text-red-600 dark:text-red-400"
                                  : "text-slate-500 dark:text-slate-400"
                              )}
                            >
                              {formatDays(cvdEst)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <StockListPriceCell
                          unitPrice={row.unitPrice}
                          expired={row.priceExpired}
                          compact
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <StockDiscountPerCaseCell
                          discountBaht={row.discountBahtPerCase}
                          discountPct={row.discountPctPerCase}
                          compact
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <StockNetPriceCell
                          unitPrice={row.unitPrice}
                          netUnitPrice={row.netUnitPrice}
                          expired={row.priceExpired}
                          compact
                        />
                      </td>
                      <td className="max-w-0 overflow-hidden px-1 py-1.5 align-top">
                        <div className="min-w-0">
                          <PromoDetailCell
                            variant="compact"
                            currentPromo={row.currentPromo}
                            currentKind={row.currentPromoKind}
                            nextPromo={row.nextPromo}
                            qtyToNext={row.qtyToNext}
                            nextPromoQty={row.nextPromoQty}
                            nextKind={row.nextPromoKind}
                            hasPromoLadder={row.hasPromoLadder}
                            onApplyNext={(qty) =>
                              setLineQty(row.skuCode, qty)
                            }
                            inspector={{
                              skuCode: row.skuCode,
                              storeCode: activeVda,
                              stagedQty: promoStagedQty,
                              promoGroup: row.promoGroup,
                              promoGroupMembers: row.promoGroupMembers,
                              onConfirmStaged: applyGroupStaged,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/40 dark:bg-slate-900/30">
                        <td />
                        <td colSpan={12} className="px-2 pb-3 pt-0">
                          <ProductSalesPanel
                            skuCode={row.skuCode}
                            fromDb={row.fromDb ?? activeVda}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
          </div>
        </div>
      </main>

      <div className="vmi-action-bar">
        <div className="mx-auto flex max-w-[88rem] flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <p className="min-w-0 flex-1 truncate text-center text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            {selected.size > 0 ? (
              selectedRedCount > 0 ? (
                <span className="font-semibold text-red-600 dark:text-red-400">
                  มี {selectedRedCount} รายการจำนวนไม่เหมาะสม — ปรับก่อนตรวจสอบ
                </span>
              ) : selectedZeroQtyCount > 0 ? (
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  มี {selectedZeroQtyCount} รายการจำนวน 0 — ปรับก่อนตรวจสอบ
                </span>
              ) : (
                <>
                  <span className="font-semibold text-teal-700 dark:text-teal-400">
                    {selected.size}
                  </span>{" "}
                  รายการพร้อมสั่ง
                </>
              )
            ) : (
              <>เลือกสินค้า ปรับจำนวน ตรวจโปร แล้วกดตรวจสอบคำสั่ง</>
            )}
          </p>
          <Button
            size="sm"
            className="mx-auto shrink-0 sm:mx-0 sm:px-5"
            disabled={
              selected.size === 0 ||
              selectedRedCount > 0 ||
              selectedZeroQtyCount > 0
            }
            onClick={goToOrder}
            title={
              selectedRedCount > 0
                ? "มีรายการจำนวนไม่เหมาะสม ปรับก่อนตรวจสอบ"
                : selectedZeroQtyCount > 0
                  ? "มีรายการจำนวน 0 ปรับก่อนตรวจสอบ"
                  : undefined
            }
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">ตรวจสอบคำสั่ง</span>
            <span className="sm:hidden">ตรวจสอบ</span>
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
  qty,
  selected,
  orderCvd,
  orderFlag,
  stagedQty,
  onConfirmStaged,
  onAdjustQty,
  onSetQty,
  onApplySuggest,
  onToggle,
  expanded,
  onToggleExpand,
}: {
  row: DisplayRow;
  storeCode: string;
  qty: number;
  selected: boolean;
  orderCvd: number | null;
  orderFlag: CvdFlag | null;
  stagedQty: Record<string, number>;
  onConfirmStaged: (staged: Record<string, number>) => void;
  onAdjustQty: (delta: number) => void;
  onSetQty: (qty: number) => void;
  onApplySuggest: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
}) {
  const lowStock =
    row.needsOrder || (row.stockCvd !== null && row.stockCvd < 7);
  const hasPromo = Boolean(
    row.currentPromo || row.nextPromo || row.hasPromoLadder
  );

  return (
    <MobileRow
      selected={selected}
      warn={
        (orderFlag === "red" || lowStock) && row.promoGroupStripe == null
      }
      className={cn(
        promoGroupRowBgClass(row.promoGroupStripe ?? null),
        orderFlag === "red"
          ? "bg-red-50/70 dark:bg-red-950/25"
          : lowStock && !row.promoGroupStripe && "bg-amber-100/80 dark:bg-amber-950/20"
      )}
    >
      {row.promoGroupIsFirst && row.promoGroupStripe != null && (
        <div className="px-3 pt-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1",
              promoGroupBadgeClass(row.promoGroupStripe)
            )}
          >
            กลุ่ม {row.promoGroup}
          </span>
        </div>
      )}
      <MobileRowTop>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 text-left"
          title="ดู/ซ่อนยอดขายรายวัน"
        >
          <p className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">
            <span className="text-teal-700 dark:text-teal-400">{row.skuCode}</span>
            <span className="mx-1.5 font-normal text-slate-300 dark:text-slate-600">
              ·
            </span>
            <span
              className={cn(
                "font-medium text-slate-800 dark:text-slate-200",
                expanded && "text-teal-700 dark:text-teal-400"
              )}
            >
              {row.skuName}
            </span>
            <BarChart3
              className={cn(
                "ml-1.5 inline h-3.5 w-3.5 shrink-0 align-text-bottom text-slate-300",
                expanded
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-slate-300 dark:text-slate-600"
              )}
            />
          </p>
          {row.barcode && (
            <p className="mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">
              {row.barcode}
            </p>
          )}
        </button>
        <StockQtyStepper
          qty={qty}
          suggestOrder={row.suggestOrder}
          onMinus={() => onAdjustQty(-1)}
          onPlus={() => onAdjustQty(1)}
          onSetQty={onSetQty}
          onApplySuggest={onApplySuggest}
          compact
        />
      </MobileRowTop>
      <MobileRowStats className="pl-7">
        <MobileStat label="สต็อก" value={formatNumber(row.stock, 0)} />
        <MobileStat label="CVD" value={formatDays(row.stockCvd)} />
        {orderFlag && (
          <MobileStat label="หลังสั่ง">
            <div className="flex flex-col items-start gap-0.5">
              <FlagBadge flag={orderFlag} compact />
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  orderFlag === "red"
                    ? "font-semibold text-red-600 dark:text-red-400"
                    : "text-slate-500"
                )}
              >
                {formatDays(orderCvd)}
              </span>
            </div>
          </MobileStat>
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
        <MobileStat label="ราคาสุทธิ/หีบ">
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
            onApplyNext={onSetQty}
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
      {expanded && (
        <MobileRowExtra className="pl-7">
          <ProductSalesPanel skuCode={row.skuCode} fromDb={row.fromDb ?? storeCode} />
        </MobileRowExtra>
      )}
    </MobileRow>
  );
}

function formatDataDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StockStatCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  tone?: "default" | "amber";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-sm",
        tone === "amber"
          ? "border-amber-200 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-950/20"
          : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/50"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          tone === "amber"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
            : "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <p
          className={cn(
            "truncate text-base font-bold tabular-nums leading-tight",
            tone === "amber"
              ? "text-amber-700 dark:text-amber-300"
              : "text-slate-800 dark:text-slate-100"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800/50">
      {label}
    </span>
  );
}

function countActiveFilters(scope: ViewScope): number {
  let n = 0;
  if (scope.needsOnly) n++;
  if (scope.brand) n++;
  if (scope.section) n++;
  return n;
}

function FilterOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
        selected
          ? "bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500"
            : "border-slate-300 dark:border-slate-600"
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function FilterOptionList({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-xl bg-slate-50/80 p-1 dark:bg-slate-900/40">
      <FilterOption
        label="ทั้งหมด"
        selected={!value}
        onClick={() => onChange(null)}
      />
      {options.map((opt) => (
        <FilterOption
          key={opt}
          label={opt}
          selected={value === opt}
          onClick={() => onChange(value === opt ? null : opt)}
        />
      ))}
    </div>
  );
}

function StockFilterDropdown({
  viewScope,
  brands,
  sections,
  filteredNeedsCount,
  onChange,
  onSelect,
  onClear,
}: {
  viewScope: ViewScope;
  brands: string[];
  sections: string[];
  filteredNeedsCount: number;
  onChange: (scope: ViewScope) => void;
  onSelect: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeCount = countActiveFilters(viewScope);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !ref.current || !panelRef.current) return;

    function positionPanel() {
      const trigger = ref.current!.getBoundingClientRect();
      const panel = panelRef.current!;
      const margin = 12;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const width = Math.min(320, vw - margin * 2);
      const gap = 6;

      const left = Math.max(
        margin,
        Math.min(trigger.right - width, vw - width - margin)
      );

      const belowTop = trigger.bottom + gap;
      const panelHeight = panel.offsetHeight;
      const spaceBelow = vh - margin - belowTop;
      const spaceAbove = trigger.top - gap - margin;

      let top = belowTop;
      let maxHeight = spaceBelow;

      if (panelHeight > spaceBelow && spaceAbove > spaceBelow) {
        maxHeight = spaceAbove;
        top = Math.max(margin, trigger.top - gap - Math.min(panelHeight, maxHeight));
      }

      maxHeight = Math.max(180, Math.min(maxHeight, vh - top - margin));

      setPanelStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight,
        zIndex: 9999,
        visibility: "visible",
      });
    }

    positionPanel();
    const raf = requestAnimationFrame(positionPanel);
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, brands.length, sections.length, filteredNeedsCount, activeCount]);

  function handleSelect() {
    onSelect();
    setOpen(false);
  }

  const panel =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                ตัวกรอง
              </p>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition-colors has-[:checked]:border-teal-300 has-[:checked]:bg-teal-50/50 dark:border-slate-700 dark:has-[:checked]:border-teal-700 dark:has-[:checked]:bg-teal-950/20">
                <Checkbox
                  checked={viewScope.needsOnly}
                  onCheckedChange={(checked) =>
                    onChange({ ...viewScope, needsOnly: checked === true })
                  }
                />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    เฉพาะที่ควรสั่ง
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    แสดงเฉพาะสินค้าที่สต็อกต่ำกว่าเกณฑ์
                  </p>
                </div>
              </label>

              {brands.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    แบรนด์
                  </p>
                  <FilterOptionList
                    options={brands}
                    value={viewScope.brand}
                    onChange={(brand) => onChange({ ...viewScope, brand })}
                  />
                </div>
              )}

              {sections.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    กลุ่มสินค้า
                  </p>
                  <FilterOptionList
                    options={sections}
                    value={viewScope.section}
                    onChange={(section) => onChange({ ...viewScope, section })}
                  />
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              {activeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    onClear();
                  }}
                >
                  ล้างกรอง
                </Button>
              )}
              <div className="min-w-0 flex-1" />
              {filteredNeedsCount > 0 ? (
                <Button size="sm" className="shrink-0" onClick={handleSelect}>
                  เลือก {filteredNeedsCount} รายการ
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => setOpen(false)}
                >
                  ปิด
                </Button>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant={activeCount > 0 ? "default" : "outline"}
        size="sm"
        className="gap-1.5 whitespace-nowrap"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Filter className="h-3.5 w-3.5" />
        กรอง
        {activeCount > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 py-px text-[10px] font-bold tabular-nums">
            {activeCount}
          </span>
        )}
      </Button>
      {panel}
    </div>
  );
}

function StockQtyStepper({
  qty,
  suggestOrder,
  onMinus,
  onPlus,
  onSetQty,
  onApplySuggest,
  compact = false,
}: {
  qty: number;
  suggestOrder: number;
  onMinus: () => void;
  onPlus: () => void;
  onSetQty?: (qty: number) => void;
  onApplySuggest?: () => void;
  compact?: boolean;
}) {
  const btn = compact ? "h-6 w-6 rounded-md" : "h-8 w-8";
  const showSuggest = suggestOrder > 0 && qty !== suggestOrder;
  const [draft, setDraft] = useState(String(qty));

  useEffect(() => {
    setDraft(String(qty));
  }, [qty]);

  function commitDraft() {
    if (!onSetQty) return;
    const n = Math.floor(Number(draft));
    if (!Number.isFinite(n) || n < 0) {
      setDraft(String(qty));
      return;
    }
    onSetQty(n);
  }

  return (
    <div
      className="inline-flex items-center justify-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      {showSuggest && onApplySuggest && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApplySuggest();
          }}
          title={`ใช้จำนวนแนะนำ ${suggestOrder}`}
          className="rounded p-0.5 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
        >
          <RotateCcw className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </button>
      )}
      <Button
        size="icon"
        variant="outline"
        className={btn}
        onClick={(e) => {
          e.stopPropagation();
          onMinus();
        }}
        disabled={qty <= 0}
        aria-label="ลดจำนวน"
      >
        <Minus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </Button>
      {onSetQty ? (
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "rounded-md border border-slate-200 bg-white text-center font-bold tabular-nums text-slate-900 outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white",
            compact ? "h-6 w-10 text-xs" : "h-8 w-12 text-sm"
          )}
          title={
            suggestOrder > 0 && qty !== suggestOrder
              ? `แนะนำ ${suggestOrder} หีบ`
              : "พิมพ์จำนวนหีบ"
          }
          aria-label="จำนวนสั่ง"
        />
      ) : (
        <span
          className={cn(
            "text-center font-bold tabular-nums text-slate-900 dark:text-white",
            compact ? "min-w-[1.5rem] text-xs" : "w-8 text-sm"
          )}
          title={
            suggestOrder > 0 && qty !== suggestOrder
              ? `แนะนำ ${suggestOrder} หีบ`
              : undefined
          }
        >
          {qty}
        </span>
      )}
      <Button
        size="icon"
        variant="outline"
        className={btn}
        onClick={(e) => {
          e.stopPropagation();
          onPlus();
        }}
        aria-label="เพิ่มจำนวน"
      >
        <Plus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      </Button>
    </div>
  );
}
