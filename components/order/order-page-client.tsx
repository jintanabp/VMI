"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  LayoutGrid,
  Minus,
  Plus,
  RotateCcw,
  Send,
  ShoppingCart,
  Sparkles,
  Table2,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { PromoDetailCell } from "@/components/promo/promo-detail-cell";
import { FlagBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MobileRow,
  MobileRowExtra,
  MobileRowList,
  MobileRowStats,
  MobileStat,
} from "@/components/ui/mobile-row";
import type { StockRowComputed } from "@/lib/repositories/types";
import {
  calcCvdEstimate,
  calcLineAmount,
  calcNetUnitPrice,
  formatDays,
  formatNumber,
  getCvdFlag,
  getPromoForQty,
  type PromoResult,
} from "@/lib/calculations";
import { cn } from "@/lib/utils";

interface OrderLine {
  row: StockRowComputed;
  qty: number;
}

interface OrderPageClientProps {
  storeCode: string;
  storeName: string;
  storeAddress?: string;
  isVda?: boolean;
}

type ViewMode = "cards" | "table";
const VIEW_KEY = "vmi_order_view";

interface LineFreeGood {
  premiumProduct: string;
  premiumName: string;
  qty: number;
  unit: string;
  unitLabel: string;
  tierFromQty: number;
  tierPremiumQty: number;
  pooledQty: number;
  lineQty: number;
}

interface PromoApiLine extends PromoResult {
  skuCode: string;
  qty: number;
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  priceExpired?: boolean;
  discountBaht?: number | null;
  discountPct?: number | null;
  freeGood?: LineFreeGood | null;
  pooledQty?: number;
}

interface EnrichedLine {
  row: StockRowComputed;
  qty: number;
  cvdEst: number | null;
  flag: ReturnType<typeof getCvdFlag>;
  promo: PromoResult;
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  priceExpired: boolean;
  freeGood: LineFreeGood | null;
}

function formatBaht(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${formatNumber(value, 0)} บาท`;
}

export function OrderPageClient({
  storeCode,
  storeName,
  storeAddress,
  isVda = false,
}: OrderPageClientProps) {
  const router = useRouter();
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [promoApi, setPromoApi] = useState<{
    lines: Record<string, PromoApiLine>;
    orderTotal: number | null;
  } | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(VIEW_KEY);
    if (saved === "cards" || saved === "table") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("vmi_order_draft");
    if (!raw) {
      router.replace("/stock");
      return;
    }
    try {
      const items = JSON.parse(raw) as StockRowComputed[];
      if (!Array.isArray(items) || items.length === 0) {
        router.replace("/stock");
        return;
      }
      setLines(
        items.map((row) => ({
          row,
          qty: row.suggestOrder > 0 ? row.suggestOrder : 1,
        }))
      );
    } catch {
      router.replace("/stock");
    }
  }, [router]);

  useEffect(() => {
    if (lines.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/promo/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            skuCode: l.row.skuCode,
            qty: l.qty,
          })),
        }),
        signal: ctrl.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.lines) return;
          const bySku: Record<string, PromoApiLine> = {};
          for (const ln of data.lines as PromoApiLine[]) {
            bySku[ln.skuCode] = ln;
          }
          setPromoApi({
            lines: bySku,
            orderTotal: data.orderTotal ?? null,
          });
        })
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [lines]);

  const enriched = useMemo(() => {
    return lines.map((line) => {
      const cvdEst = calcCvdEstimate(line.row.stock, line.qty, line.row.avgSales);
      const flag = getCvdFlag(cvdEst);
      const api = promoApi?.lines[line.row.skuCode];
      const fallbackPromo = getPromoForQty(line.qty, line.row.promoTiers ?? []);
      const promo: PromoResult = api
        ? {
            currentPromo: api.currentPromo,
            nextPromo: api.nextPromo,
            nextPromoQty: api.nextPromoQty,
            qtyToNext: api.qtyToNext,
            currentKind: api.currentKind,
            nextKind: api.nextKind,
            hasPromoLadder: api.hasPromoLadder ?? (line.row.promoTiers?.length ?? 0) > 0,
          }
        : fallbackPromo;

      const unitPrice = api?.unitPrice ?? line.row.unitPrice ?? null;
      const netUnitPrice =
        api?.netUnitPrice ??
        calcNetUnitPrice(unitPrice, api?.discountBaht, api?.discountPct) ??
        line.row.netUnitPrice ??
        unitPrice;
      const lineTotal =
        api?.lineTotal ??
        calcLineAmount(line.qty, unitPrice, netUnitPrice);

      return {
        row: line.row,
        qty: line.qty,
        cvdEst,
        flag,
        promo,
        unitPrice,
        netUnitPrice,
        lineTotal,
        priceExpired: api?.priceExpired ?? line.row.priceExpired ?? false,
        freeGood: api?.freeGood ?? null,
      };
    });
  }, [lines, promoApi]);

  const stats = useMemo(() => {
    const totalQty = enriched.reduce((s, l) => s + l.qty, 0);
    const redCount = enriched.filter((l) => l.flag === "red").length;
    const withPromo = enriched.filter((l) => l.promo.currentPromo).length;
    const orderTotal =
      promoApi?.orderTotal ??
      enriched.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
    return {
      totalQty,
      redCount,
      withPromo,
      skuCount: enriched.length,
      orderTotal: orderTotal > 0 ? orderTotal : null,
    };
  }, [enriched, promoApi]);

  const hasRedFlag = stats.redCount > 0;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: enriched.map((l) => ({
            skuId: l.row.skuId,
            suggestedQty: l.row.suggestOrder,
            finalQty: l.qty,
            cvdEstimate: l.cvdEst,
          })),
        }),
      });
      if (!res.ok) throw new Error("submit failed");
      return res.json();
    },
    onSuccess: () => {
      sessionStorage.removeItem("vmi_order_draft");
      setSuccess(true);
      setConfirmOpen(false);
    },
  });

  function updateQty(skuId: string, delta: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.row.skuId === skuId
          ? { ...l, qty: Math.max(1, l.qty + delta) }
          : l
      )
    );
  }

  function setQty(skuId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.row.skuId === skuId ? { ...l, qty: Math.max(1, qty) } : l
      )
    );
  }

  function applySuggest(skuId: string, suggest: number) {
    if (suggest > 0) setQty(skuId, suggest);
  }

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    sessionStorage.setItem(VIEW_KEY, mode);
  }

  if (success) {
    return (
      <PageShell>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="vmi-card-elevated max-w-md p-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">ส่งคำสั่งซื้อแล้ว</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              คำสั่งซื้อของคุณถูกส่งไปยังเซลล์เพื่อตรวจสอบและอนุมัติ
            </p>
            <div className="mt-6 flex justify-center">
              <Button onClick={() => router.push("/stock")}>
                กลับหน้าสต็อก
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (lines.length === 0) {
    return (
      <PageShell>
        <div className="flex min-h-screen items-center justify-center text-slate-500 dark:text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="vmi-order-page pb-20">
      <AppHeader
        compact
        title={`สั่งสินค้า · ${storeCode.toUpperCase()}`}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main className="vmi-order-main mx-auto w-full min-w-0 max-w-7xl px-3 sm:px-4">
        <div className="vmi-order-stats grid shrink-0 grid-cols-2 gap-1.5 py-2 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5 xl:py-3">
          <SummaryChip
            label="รายการ"
            value={`${stats.skuCount} SKU`}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <SummaryChip
            label="รวมสั่ง"
            value={`${stats.totalQty} หีบ`}
            highlight
          />
          {stats.orderTotal != null && (
            <SummaryChip
              label="มูลค่ารวม"
              value={formatBaht(stats.orderTotal)}
            />
          )}
          <SummaryChip
            label="ได้โปร"
            value={`${stats.withPromo} รายการ`}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <SummaryChip
            label="ต้องแก้"
            value={stats.redCount > 0 ? `${stats.redCount} รายการ` : "ไม่มี"}
            warn={stats.redCount > 0}
          />
        </div>

        {hasRedFlag && (
          <div className="mb-2 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            มีรายการ CVD ไม่เหมาะสม (สีแดง) — ปรับจำนวนก่อนส่ง
          </div>
        )}

        <div className="vmi-stock-toolbar shrink-0 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {enriched.length} รายการ
          </p>
          <div className="flex shrink-0 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900 max-xl:hidden">
            <button
              type="button"
              onClick={() => switchView("cards")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                viewMode === "cards"
                  ? "bg-[#0f4c75] text-white dark:bg-[#1a6b9a]"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">การ์ด</span>
            </button>
            <button
              type="button"
              onClick={() => switchView("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                viewMode === "table"
                  ? "bg-[#0f4c75] text-white dark:bg-[#1a6b9a]"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Table2 className="h-4 w-4" />
              <span className="hidden sm:inline">ตาราง</span>
            </button>
          </div>
        </div>

        <div className="vmi-table-wrap vmi-order-list-wrap min-h-0 flex-1">
          <div className="vmi-order-list-scroll vmi-table-scroll">
            <div className="xl:hidden">
              <OrderLineMobileList
                lines={enriched}
                onDelta={updateQty}
                onApplySuggest={applySuggest}
                onApplyPromo={setQty}
              />
            </div>
            {viewMode === "cards" ? (
              <div className="mx-auto hidden w-full max-w-3xl space-y-4 xl:block">
                {enriched.map((line, index) => (
                  <OrderLineCard
                    key={line.row.skuId}
                    index={index + 1}
                    line={line}
                    onDelta={(d) => updateQty(line.row.skuId, d)}
                    onApplySuggest={() =>
                      applySuggest(line.row.skuId, line.row.suggestOrder)
                    }
                    onApplyPromo={(qty) => setQty(line.row.skuId, qty)}
                  />
                ))}
              </div>
            ) : (
              <div className="hidden xl:block">
                <OrderLineTable
                  lines={enriched}
                  onDelta={updateQty}
                  onApplySuggest={applySuggest}
                  onApplyPromo={setQty}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* แถบส่งด้านล่าง */}
      <div className="vmi-action-bar">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => router.push("/stock")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">ย้อนกลับ</span>
          </Button>
          <div className="min-w-0 text-center text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              รวม {stats.totalQty} หีบ · {stats.skuCount} รายการ
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            disabled={hasRedFlag || submitMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Send className="h-4 w-4" />
            ส่งคำสั่ง
          </Button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="vmi-card-elevated flex max-h-[min(32rem,calc(100dvh-5rem))] w-full max-w-md flex-col rounded-2xl p-5 sm:max-h-[min(36rem,calc(100dvh-4rem))] sm:p-6">
            <h3 className="shrink-0 text-lg font-bold">ยืนยันส่งคำสั่งซื้อ?</h3>
            <p className="mt-1 shrink-0 text-sm text-slate-600 dark:text-slate-400">
              {stats.skuCount} รายการ · รวม {stats.totalQty} หีบ
            </p>
            <ul className="vmi-scroll mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-2 text-sm sm:pr-3">
              {enriched.map((l) => (
                <li
                  key={l.row.skuId}
                  className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0 dark:border-slate-700"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200">
                      {l.row.skuCode}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {l.row.skuName}
                    </p>
                  </div>
                  <span className="shrink-0 pt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {l.qty} หีบ
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex shrink-0 gap-2 sm:mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmOpen(false)}
              >
                ยกเลิก
              </Button>
              <Button
                className="flex-1"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? "กำลังส่ง..." : "ยืนยัน"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SummaryChip({
  label,
  value,
  icon,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "vmi-stat-card !p-2.5 xl:!p-3",
        highlight && "ring-1 ring-teal-500/30",
        warn && "ring-1 ring-red-500/40"
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 xl:text-xs dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold xl:mt-1 xl:text-lg",
          warn
            ? "text-red-600 dark:text-red-400"
            : "text-slate-900 dark:text-slate-100"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OrderQtyControl({
  qty,
  onMinus,
  onPlus,
  showSuggest,
  onApplySuggest,
  size = "md",
}: {
  qty: number;
  onMinus: () => void;
  onPlus: () => void;
  showSuggest?: boolean;
  onApplySuggest?: () => void;
  size?: "md" | "lg";
}) {
  const btn = size === "lg" ? "h-10 w-10 rounded-xl" : "h-8 w-8";
  const qtyClass =
    size === "lg"
      ? "min-w-[3rem] text-center text-2xl font-bold tabular-nums"
      : "w-7 text-center text-sm font-bold tabular-nums";

  return (
    <div className="flex w-[6.75rem] shrink-0 flex-col items-end gap-0.5">
      <div className="flex items-center justify-end gap-0.5">
        {showSuggest && onApplySuggest && (
          <button
            type="button"
            onClick={onApplySuggest}
            title="ใช้จำนวนแนะนำ"
            className="mr-0.5 rounded-lg p-1 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <Button
          size="icon"
          variant="outline"
          className={btn}
          onClick={onMinus}
          aria-label="ลดจำนวน"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className={cn(qtyClass, "text-slate-900 dark:text-white")}>
          {qty}
        </span>
        <Button
          size="icon"
          variant="outline"
          className={btn}
          onClick={onPlus}
          aria-label="เพิ่มจำนวน"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <span className="pr-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
        หีบ
      </span>
    </div>
  );
}

function OrderLineCard({
  index,
  line,
  onDelta,
  onApplySuggest,
  onApplyPromo,
}: {
  index: number;
  line: EnrichedLine;
  onDelta: (delta: number) => void;
  onApplySuggest: () => void;
  onApplyPromo: (qty: number) => void;
}) {
  const showSuggestBtn =
    line.row.suggestOrder > 0 && line.qty !== line.row.suggestOrder;

  return (
    <article
      className={cn(
        "vmi-order-card p-4 sm:p-5",
        line.flag === "red" && "vmi-order-card--warn"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {index}
            </span>
            <span className="font-semibold text-teal-700 dark:text-teal-400">
              {line.row.skuCode}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {line.row.skuName}
          </p>
        </div>
        <FlagBadge flag={line.flag} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
          แนะนำ {line.row.suggestOrder} หีบ
        </span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
          CVD {formatDays(line.cvdEst)}
        </span>
        {line.unitPrice != null && (
          <PriceChip
            unitPrice={line.unitPrice}
            netUnitPrice={line.netUnitPrice}
            lineTotal={line.lineTotal}
            expired={line.priceExpired}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          จำนวนสั่ง
        </span>
        <OrderQtyControl
          qty={line.qty}
          size="lg"
          onMinus={() => onDelta(-1)}
          onPlus={() => onDelta(1)}
          showSuggest={showSuggestBtn}
          onApplySuggest={onApplySuggest}
        />
      </div>

      <PromoDetailCell
        variant="card"
        currentPromo={line.promo.currentPromo}
        currentKind={line.promo.currentKind}
        nextPromo={line.promo.nextPromo}
        qtyToNext={line.promo.qtyToNext}
        nextPromoQty={line.promo.nextPromoQty}
        nextKind={line.promo.nextKind}
        hasPromoLadder={line.promo.hasPromoLadder}
        freeGood={line.freeGood}
        onApplyNext={onApplyPromo}
      />
    </article>
  );
}

function OrderLineMobileList({
  lines,
  onDelta,
  onApplySuggest,
  onApplyPromo,
}: {
  lines: EnrichedLine[];
  onDelta: (skuId: string, delta: number) => void;
  onApplySuggest: (skuId: string, suggest: number) => void;
  onApplyPromo: (skuId: string, qty: number) => void;
}) {
  return (
    <MobileRowList>
      {lines.map((line, index) => {
        const showSuggest =
          line.row.suggestOrder > 0 && line.qty !== line.row.suggestOrder;
        const hasPromo =
          line.promo.currentPromo ||
          line.promo.nextPromo ||
          line.promo.hasPromoLadder ||
          line.freeGood;

        return (
          <MobileRow key={line.row.skuId} warn={line.flag === "red"}>
            <div className="flex items-start gap-2">
              <span className="w-5 shrink-0 pt-0.5 text-xs text-slate-400">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-teal-700 dark:text-teal-400">
                    {line.row.skuCode}
                  </span>
                  <FlagBadge flag={line.flag} />
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-slate-800 dark:text-slate-200">
                  {line.row.skuName}
                </p>
              </div>
              <OrderQtyControl
                qty={line.qty}
                onMinus={() => onDelta(line.row.skuId, -1)}
                onPlus={() => onDelta(line.row.skuId, 1)}
                showSuggest={showSuggest}
                onApplySuggest={() =>
                  onApplySuggest(line.row.skuId, line.row.suggestOrder)
                }
              />
            </div>
            <MobileRowStats className="pl-7">
              {line.unitPrice != null ? (
                <MobileStat label="ราคา">
                  <PriceCell
                    unitPrice={line.unitPrice}
                    netUnitPrice={line.netUnitPrice}
                    expired={line.priceExpired}
                  />
                </MobileStat>
              ) : (
                <MobileStat label="ราคา" value="-" />
              )}
              <MobileStat label="รวม" value={formatBaht(line.lineTotal)} />
              <MobileStat label="CVD" value={formatDays(line.cvdEst)} />
              {line.row.suggestOrder > 0 && (
                <MobileStat
                  label="แนะนำ"
                  value={`${line.row.suggestOrder} หีบ`}
                />
              )}
            </MobileRowStats>
            {hasPromo && (
              <MobileRowExtra className="pl-7">
                <PromoDetailCell
                  variant="embedded"
                  currentPromo={line.promo.currentPromo}
                  currentKind={line.promo.currentKind}
                  nextPromo={line.promo.nextPromo}
                  qtyToNext={line.promo.qtyToNext}
                  nextPromoQty={line.promo.nextPromoQty}
                  nextKind={line.promo.nextKind}
                  hasPromoLadder={line.promo.hasPromoLadder}
                  freeGood={line.freeGood}
                  onApplyNext={(qty) => onApplyPromo(line.row.skuId, qty)}
                />
              </MobileRowExtra>
            )}
          </MobileRow>
        );
      })}
    </MobileRowList>
  );
}

function OrderLineTable({
  lines,
  onDelta,
  onApplySuggest,
  onApplyPromo,
}: {
  lines: EnrichedLine[];
  onDelta: (skuId: string, delta: number) => void;
  onApplySuggest: (skuId: string, suggest: number) => void;
  onApplyPromo: (skuId: string, qty: number) => void;
}) {
  return (
    <table className="vmi-data-table w-full min-w-0 text-left">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">ชื่อสินค้า</th>
                <th className="px-3 py-3 text-right">แนะนำ</th>
                <th className="px-3 py-3 text-right">ราคา/หีบ</th>
                <th className="px-3 py-3 text-right">รวม</th>
                <th className="px-3 py-3 text-right">CVD</th>
                <th className="px-3 py-3 text-center">สถานะ</th>
                <th className="px-3 py-3 text-center">จำนวนสั่ง</th>
                <th className="px-3 py-3">โปร</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const showSuggest =
                  line.row.suggestOrder > 0 &&
                  line.qty !== line.row.suggestOrder;

                return (
                  <tr
                    key={line.row.skuId}
                    className={cn(
                      "border-t border-slate-100 dark:border-slate-700/60",
                      line.flag === "red" &&
                        "bg-red-50/50 dark:bg-red-950/20"
                    )}
                  >
                    <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-teal-700 dark:text-teal-400">
                      {line.row.skuCode}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      {line.row.skuName}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {line.row.suggestOrder}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums">
                      {line.unitPrice != null ? (
                        <PriceCell
                          unitPrice={line.unitPrice}
                          netUnitPrice={line.netUnitPrice}
                          expired={line.priceExpired}
                        />
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-slate-800 dark:text-slate-200">
                      {formatBaht(line.lineTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {formatDays(line.cvdEst)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <FlagBadge flag={line.flag} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => onDelta(line.row.skuId, -1)}
                          aria-label="ลดจำนวน"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-[2.5rem] text-center font-bold tabular-nums">
                          {line.qty}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => onDelta(line.row.skuId, 1)}
                          aria-label="เพิ่มจำนวน"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        {showSuggest && (
                          <button
                            type="button"
                            title="ใช้จำนวนแนะนำ"
                            onClick={() =>
                              onApplySuggest(
                                line.row.skuId,
                                line.row.suggestOrder
                              )
                            }
                            className="ml-1 rounded-lg p-1 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="min-w-[220px] px-3 py-2.5 align-top">
                      <PromoDetailCell
                        variant="table"
                        currentPromo={line.promo.currentPromo}
                        currentKind={line.promo.currentKind}
                        nextPromo={line.promo.nextPromo}
                        qtyToNext={line.promo.qtyToNext}
                        nextPromoQty={line.promo.nextPromoQty}
                        nextKind={line.promo.nextKind}
                        hasPromoLadder={line.promo.hasPromoLadder}
                        freeGood={line.freeGood}
                        onApplyNext={(qty) =>
                          onApplyPromo(line.row.skuId, qty)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
  );
}

function PriceCell({
  unitPrice,
  netUnitPrice,
  expired,
}: {
  unitPrice: number;
  netUnitPrice: number | null;
  expired?: boolean;
}) {
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

function PriceChip({
  unitPrice,
  netUnitPrice,
  lineTotal,
  expired,
}: {
  unitPrice: number;
  netUnitPrice: number | null;
  lineTotal: number | null;
  expired?: boolean;
}) {
  const hasDiscount =
    netUnitPrice != null && netUnitPrice < unitPrice - 0.001;
  return (
    <span
      className={cn(
        "rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800",
        expired && "ring-1 ring-amber-300 dark:ring-amber-700"
      )}
    >
      {hasDiscount ? (
        <>
          <span className="line-through opacity-60">
            {formatNumber(unitPrice, 0)}
          </span>{" "}
          <span className="font-semibold text-teal-700 dark:text-teal-400">
            {formatNumber(netUnitPrice!, 0)}
          </span>
        </>
      ) : (
        formatNumber(unitPrice, 0)
      )}
      {lineTotal != null && (
        <span className="ml-1 font-semibold">· รวม {formatNumber(lineTotal, 0)}</span>
      )}
    </span>
  );
}
