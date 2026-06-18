"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Gift,
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
import { FlagBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  type PromoTierKind,
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
    if (saved === "cards" || saved === "table") setViewMode(saved);
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
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600 dark:from-emerald-900/40 dark:to-teal-900/40 dark:text-emerald-400">
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
    <PageShell className="pb-44 md:pb-28" customerNav>
      <AppHeader
        title="สั่งสินค้า"
        subtitle="ปรับจำนวนแล้วส่งให้เซลล์อนุมัติ"
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main
        className={cn(
          "mx-auto w-full min-w-0 px-3 py-4 pb-10 sm:px-4 sm:py-5",
          viewMode === "table" ? "max-w-7xl" : "max-w-3xl"
        )}
      >
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mb-5 lg:grid-cols-5">
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
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            มีรายการ CVD ไม่เหมาะสม (สีแดง) — ปรับจำนวนก่อนส่ง
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {enriched.length} รายการ
          </p>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => switchView("cards")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                viewMode === "cards"
                  ? "bg-gradient-to-r from-[#0f4c75] to-[#0e7490] text-white shadow-sm"
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
                  ? "bg-gradient-to-r from-[#0f4c75] to-[#0e7490] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Table2 className="h-4 w-4" />
              <span className="hidden sm:inline">ตาราง</span>
            </button>
          </div>
        </div>

        {viewMode === "cards" ? (
          <div className="space-y-4 pb-6">
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
          <OrderLineTable
            lines={enriched}
            onDelta={updateQty}
            onApplySuggest={applySuggest}
            onApplyPromo={setQty}
          />
        )}
      </main>

      {/* แถบส่งด้านล่าง */}
      <div className="vmi-sticky-bar fixed bottom-14 left-0 right-0 z-40 px-4 py-3 md:bottom-0">
        <div
          className={cn(
            "mx-auto flex w-full items-center justify-between gap-3",
            viewMode === "table" ? "max-w-7xl" : "max-w-3xl"
          )}
        >
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="vmi-card-elevated w-full max-w-md rounded-2xl p-6">
            <h3 className="text-lg font-bold">ยืนยันส่งคำสั่งซื้อ?</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {stats.skuCount} รายการ · รวม {stats.totalQty} หีบ
            </p>
            <ul className="vmi-scroll mt-4 max-h-48 space-y-2 overflow-y-auto pr-3 text-sm">
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
            <div className="mt-6 flex gap-2">
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
        "vmi-stat-card !p-3",
        highlight && "ring-1 ring-teal-500/30",
        warn && "ring-1 ring-red-500/40"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-1 text-lg font-bold",
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
        <div className="flex items-center gap-3">
          {showSuggestBtn && (
            <button
              type="button"
              onClick={onApplySuggest}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
              title="ใช้จำนวนแนะนำ"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              แนะนำ
            </button>
          )}
          <Button
            size="icon"
            variant="outline"
            className="h-10 w-10 rounded-xl"
            onClick={() => onDelta(-1)}
            aria-label="ลดจำนวน"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {line.qty}
          </span>
          <Button
            size="icon"
            variant="outline"
            className="h-10 w-10 rounded-xl"
            onClick={() => onDelta(1)}
            aria-label="เพิ่มจำนวน"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <span className="text-sm text-slate-500 dark:text-slate-400">หีบ</span>
        </div>
      </div>

      <PromoOrderCell promo={line.promo} onApplyNext={onApplyPromo} />
      {line.freeGood && <FreeGoodBlock freeGood={line.freeGood} />}
    </article>
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
    <div className="pb-6">
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500 lg:hidden">
        เลื่อนตารางซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด
      </p>
      <div className="vmi-table-wrap">
        <div className="vmi-table-scroll">
          <table className="w-full min-w-[1040px] text-left text-sm">
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
                const hasPromo = !!line.promo.currentPromo;
                const hasNext =
                  !!line.promo.nextPromo &&
                  line.promo.nextPromoQty !== null &&
                  (line.promo.qtyToNext ?? 0) > 0;

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
                    <td className="max-w-[200px] px-3 py-2.5 text-xs">
                      {hasPromo && (
                        <p
                          className={cn(
                            "truncate font-medium",
                            promoKindClass(line.promo.currentKind)
                          )}
                        >
                          {line.promo.currentPromo}
                        </p>
                      )}
                      {line.freeGood && (
                        <FreeGoodInline freeGood={line.freeGood} />
                      )}
                      {hasNext && (
                        <button
                          type="button"
                          className="mt-0.5 truncate text-left text-blue-700 hover:underline dark:text-blue-400"
                          onClick={() =>
                            onApplyPromo(
                              line.row.skuId,
                              line.promo.nextPromoQty!
                            )
                          }
                        >
                          +{line.promo.qtyToNext} → {line.promo.nextPromo}
                        </button>
                      )}
                      {!hasPromo && !hasNext && (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FreeGoodBlock({ freeGood }: { freeGood: LineFreeGood }) {
  const pooled =
    freeGood.pooledQty > freeGood.lineQty
      ? `รวม ${freeGood.pooledQty} หีบในกลุ่มโปรเดียวกัน`
      : null;
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-800/60 dark:bg-violet-950/30">
      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-violet-900 dark:text-violet-200">
          แถม {freeGood.premiumName}
          {freeGood.premiumName !== freeGood.premiumProduct && (
            <span className="ml-1 font-normal text-violet-700 dark:text-violet-300">
              ({freeGood.premiumProduct})
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-violet-800 dark:text-violet-300">
          {freeGood.qty} {freeGood.unitLabel}
          {" · "}
          โปรซื้อ {freeGood.tierFromQty} แถม {freeGood.tierPremiumQty}
          {pooled ? ` · ${pooled}` : ""}
        </p>
      </div>
    </div>
  );
}

function FreeGoodInline({ freeGood }: { freeGood: LineFreeGood }) {
  return (
    <p className="truncate text-violet-700 dark:text-violet-400">
      แถม {freeGood.premiumName} ×{freeGood.qty} {freeGood.unitLabel}
    </p>
  );
}

function promoKindClass(kind?: PromoTierKind | null): string {
  if (kind === "premium") {
    return "text-violet-700 dark:text-violet-400";
  }
  if (kind === "discount_baht" || kind === "discount_pct") {
    return "text-emerald-700 dark:text-emerald-400";
  }
  return "text-emerald-700 dark:text-emerald-400";
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

function PromoOrderCell({
  promo,
  onApplyNext,
}: {
  promo: PromoResult;
  onApplyNext: (qty: number) => void;
}) {
  const hasCurrent = !!promo.currentPromo;
  const hasNext =
    !!promo.nextPromo &&
    promo.nextPromoQty !== null &&
    (promo.qtyToNext ?? 0) > 0;

  if (!hasCurrent && !hasNext) return null;

  const currentClass = promoKindClass(promo.currentKind);

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-dashed border-slate-200 p-3 dark:border-slate-700">
      {hasCurrent && (
        <p className={cn("flex items-start gap-2 text-sm font-medium", currentClass)}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          {promo.currentKind === "premium" ? "ได้แถม: " : "ได้โปร: "}
          {promo.currentPromo}
        </p>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={() => onApplyNext(promo.nextPromoQty!)}
          className="w-full rounded-lg bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
        >
          แตะเพื่อซื้อเพิ่ม {promo.qtyToNext} หีบ → {promo.nextPromo}
        </button>
      )}
      {hasCurrent && !hasNext && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          ถึงโปรสูงสุดแล้ว
        </p>
      )}
    </div>
  );
}
