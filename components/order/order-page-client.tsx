"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Send,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { PromoDetailCell } from "@/components/promo/promo-detail-cell";
import {
  StockDiscountPerCaseCell,
  StockListPriceCell,
  StockNetPriceCell,
} from "@/components/stock/stock-price-cells";
import { Button } from "@/components/ui/button";
import { FlagBadge } from "@/components/ui/badge";
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
import {
  annotatePromoGroupStripes,
  promoGroupRowBgClass,
  sortRowsByPromoGroup,
  type PromoGroupStripe,
} from "@/lib/promo/promo-group-display";

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
  promoGroup?: string | null;
  promoGroupMembers?: number;
}

interface EnrichedLine {
  row: StockRowComputed;
  qty: number;
  cvdEst: number | null;
  flag: ReturnType<typeof getCvdFlag> | null;
  promo: PromoResult;
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  priceExpired: boolean;
  discountBaht?: number | null;
  discountPct?: number | null;
  freeGood: LineFreeGood | null;
  promoGroup?: string | null;
  promoGroupMembers?: number;
  pooledQty?: number;
  skuCode?: string;
  promoGroupStripe?: PromoGroupStripe | null;
  promoGroupIsFirst?: boolean;
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
  const [success, setSuccess] = useState(false);
  const [promoApi, setPromoApi] = useState<{
    lines: Record<string, PromoApiLine>;
    orderTotal: number | null;
  } | null>(null);

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
      let qtyBySku: Record<string, number> = {};
      try {
        const rawQty = sessionStorage.getItem("vmi_order_qty");
        if (rawQty) qtyBySku = JSON.parse(rawQty) as Record<string, number>;
      } catch {
        qtyBySku = {};
      }
      setLines(
        items.map((row) => ({
          row,
          qty:
            qtyBySku[row.skuCode] ??
            (row.suggestOrder > 0 ? row.suggestOrder : 0),
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
      const cvdEst =
        line.row.avgSales > 0
          ? calcCvdEstimate(line.row.stock, line.qty, line.row.avgSales)
          : null;
      const flag =
        line.row.avgSales <= 0
          ? null
          : getCvdFlag(cvdEst, line.row.minDays, line.row.maxDays);
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
      const discountBaht =
        api?.discountBaht ?? line.row.discountBahtPerCase ?? null;
      const discountPct =
        api?.discountPct ?? line.row.discountPctPerCase ?? null;
      const netUnitPrice =
        api?.netUnitPrice ??
        calcNetUnitPrice(unitPrice, discountBaht, discountPct) ??
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
        discountBaht,
        discountPct,
        freeGood: api?.freeGood ?? null,
        promoGroup: api?.promoGroup ?? line.row.promoGroup ?? null,
        promoGroupMembers:
          api?.promoGroupMembers ?? line.row.promoGroupMembers ?? 0,
        pooledQty: api?.pooledQty ?? line.qty,
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

  const displayLines = useMemo(() => {
    const withGroup = enriched.map((line) => ({
      ...line,
      promoGroup: line.promoGroup ?? line.row.promoGroup ?? null,
      promoGroupMembers:
        line.promoGroupMembers ?? line.row.promoGroupMembers ?? 0,
      skuCode: line.row.skuCode,
    }));
    return annotatePromoGroupStripes(sortRowsByPromoGroup(withGroup));
  }, [enriched]);

  const hasRedFlag = stats.redCount > 0;

  function resetAllToSuggested() {
    const next = lines
      .map((line) => ({
        ...line,
        qty: line.row.suggestOrder > 0 ? line.row.suggestOrder : 0,
      }))
      .filter((line) => line.qty > 0);
    setLines(next);
    const qtyMap: Record<string, number> = {};
    for (const line of next) {
      qtyMap[line.row.skuCode] = line.qty;
    }
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
    sessionStorage.setItem(
      "vmi_order_draft",
      JSON.stringify(next.map((l) => l.row))
    );
  }

  function focusSkuOnStock(skuCode: string) {
    sessionStorage.setItem("vmi_focus_sku", skuCode);
    router.push("/stock");
  }

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
    },
  });

  function submitOrder() {
    submitMutation.mutate();
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
        wide
        title={`ตรวจสอบคำสั่ง · ${storeCode.toUpperCase()}`}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main className="vmi-order-main mx-auto w-full min-w-0 max-w-[88rem] px-3 sm:px-4">
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

        <p className="mb-2 shrink-0 text-xs text-slate-500 dark:text-slate-400">
          ตรวจสอบรายการก่อนส่ง — หากต้องการแก้ไข กลับไปหน้าสต็อก
        </p>

        {hasRedFlag && (
          <div className="mb-2 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            มีรายการ CVD ไม่เหมาะสม (สีแดง) — กด «แก้ที่สต็อก» เพื่อกลับไปปรับจำนวน
          </div>
        )}

        <OrderSummaryList
          lines={displayLines}
          onFocusStock={focusSkuOnStock}
        />
      </main>

      <div className="vmi-action-bar">
        <div className="mx-auto flex w-full max-w-[88rem] items-center justify-between gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => router.push("/stock")}
            disabled={submitMutation.isPending}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">กลับหน้าสต็อก</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={resetAllToSuggested}
            disabled={submitMutation.isPending}
            title="รีเซ็ตจำนวนทุกรายการกลับเป็นที่แนะนำ"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden md:inline">รีเซ็ตเป็นจำนวนแนะนำ</span>
          </Button>
          <div className="min-w-0 flex-1 text-center text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              รวม {stats.totalQty} หีบ · {stats.skuCount} รายการ
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            disabled={hasRedFlag || submitMutation.isPending}
            onClick={submitOrder}
          >
            <Send className="h-4 w-4" />
            {submitMutation.isPending ? "กำลังส่ง..." : "ยืนยันส่ง"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function OrderSummaryPromo({ line }: { line: EnrichedLine }) {
  const hasPromo =
    line.promo.currentPromo ||
    line.freeGood ||
    (line.promo.hasPromoLadder && line.promo.currentKind);

  if (!hasPromo) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <PromoDetailCell
      variant="compact"
      currentPromo={line.promo.currentPromo}
      currentKind={line.promo.currentKind}
      nextPromo={line.promo.nextPromo}
      qtyToNext={line.promo.qtyToNext}
      nextPromoQty={line.promo.nextPromoQty}
      nextKind={line.promo.nextKind}
      hasPromoLadder={line.promo.hasPromoLadder}
      freeGood={line.freeGood}
    />
  );
}

function OrderSummaryList({
  lines,
  onFocusStock,
}: {
  lines: EnrichedLine[];
  onFocusStock: (skuCode: string) => void;
}) {
  return (
    <div className="vmi-table-wrap vmi-order-list-wrap min-h-0 flex-1">
      <div className="vmi-order-list-scroll vmi-table-scroll">
        <div className="xl:hidden">
          <MobileRowList grid>
            {lines.map((line, index) => (
              <MobileRow
                key={line.row.skuId}
                className={promoGroupRowBgClass(line.promoGroupStripe ?? null)}
              >
                <div className="flex items-start gap-2">
                  <span className="w-5 shrink-0 pt-0.5 text-xs text-slate-400">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-teal-700 dark:text-teal-400">
                      {line.row.skuCode}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-800 dark:text-slate-200">
                      {line.row.skuName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                      {line.qty} หีบ
                    </span>
                    <button
                      type="button"
                      onClick={() => onFocusStock(line.row.skuCode)}
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      <Pencil className="h-3 w-3" />
                      แก้ที่สต็อก
                    </button>
                  </div>
                </div>
                <MobileRowStats className="pl-7">
                  <MobileStat
                    label="MIN / MAX"
                    value={`${line.row.minDays} / ${line.row.maxDays} วัน`}
                  />
                  <MobileStat label="ราคา/หีบ">
                    <StockListPriceCell
                      unitPrice={line.unitPrice}
                      expired={line.priceExpired}
                      compact
                    />
                  </MobileStat>
                  <MobileStat label="ส่วนลด">
                    <StockDiscountPerCaseCell
                      discountBaht={line.discountBaht}
                      discountPct={line.discountPct}
                      compact
                    />
                  </MobileStat>
                  <MobileStat label="ราคาสุทธิ/หีบ">
                    <StockNetPriceCell
                      unitPrice={line.unitPrice}
                      netUnitPrice={line.netUnitPrice}
                      expired={line.priceExpired}
                      compact
                    />
                  </MobileStat>
                  <MobileStat label="รวม" value={formatBaht(line.lineTotal)} />
                  <MobileStat label="CVD" value={formatDays(line.cvdEst)} />
                </MobileRowStats>
                {(line.promo.currentPromo || line.freeGood) && (
                  <MobileRowExtra className="pl-7">
                    <OrderSummaryPromo line={line} />
                  </MobileRowExtra>
                )}
              </MobileRow>
            ))}
          </MobileRowList>
        </div>

        <table className="vmi-data-table vmi-stock-fit-table hidden w-full min-w-0 table-fixed text-left xl:table">
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[8%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[21%]" />
          </colgroup>
          <thead className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            <tr>
              <th className="px-2 py-3">#</th>
              <th className="px-2 py-3">SKU</th>
              <th className="px-2 py-3">ชื่อสินค้า</th>
              <th className="px-2 py-3 text-right">จำนวน</th>
              <th
                className="px-2 py-3 text-right"
                title="เป้าหมาย CVD ต่ำสุด / สูงสุด (วัน) ตามที่ตั้งในหน้าจัดการ"
              >
                MIN / MAX
              </th>
              <th className="px-2 py-3 text-right">ราคา/หีบ</th>
              <th className="px-2 py-3 text-right">ส่วนลด</th>
              <th className="px-2 py-3 text-right">ราคาสุทธิ/หีบ</th>
              <th className="px-2 py-3 text-right">รวม</th>
              <th className="px-2 py-3 text-right">CVD</th>
              <th className="px-2 py-3">โปรที่ได้</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={line.row.skuId}
                className={cn(
                  "border-t border-slate-100 dark:border-slate-800",
                  promoGroupRowBgClass(line.promoGroupStripe ?? null),
                  line.flag === "red" && "bg-red-50/70 dark:bg-red-950/25"
                )}
              >
                <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
                <td className="px-3 py-2.5 font-medium text-teal-700 dark:text-teal-400">
                  {line.row.skuCode}
                </td>
                <td className="max-w-[240px] truncate px-3 py-2.5 text-slate-700 dark:text-slate-300">
                  {line.row.skuName}
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-semibold tabular-nums">
                      {line.qty} หีบ
                    </span>
                    <button
                      type="button"
                      onClick={() => onFocusStock(line.row.skuCode)}
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                      title="กลับหน้าสต็อกเพื่อแก้จำนวน SKU นี้"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      แก้ที่สต็อก
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {line.row.minDays} / {line.row.maxDays} วัน
                </td>
                <td className="px-2 py-2.5 text-right">
                  <StockListPriceCell
                    unitPrice={line.unitPrice}
                    expired={line.priceExpired}
                    compact
                  />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <StockDiscountPerCaseCell
                    discountBaht={line.discountBaht}
                    discountPct={line.discountPct}
                    compact
                  />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <StockNetPriceCell
                    unitPrice={line.unitPrice}
                    netUnitPrice={line.netUnitPrice}
                    expired={line.priceExpired}
                    compact
                  />
                </td>
                <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums">
                  {formatBaht(line.lineTotal)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {line.flag ? (
                    <div className="inline-flex flex-col items-end gap-0.5">
                      <span
                        className={cn(
                          "text-sm font-bold leading-none tabular-nums",
                          line.flag === "red"
                            ? "text-red-600 dark:text-red-400"
                            : line.flag === "yellow"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {formatDays(line.cvdEst)}
                      </span>
                      <FlagBadge flag={line.flag} compact />
                    </div>
                  ) : (
                    <span className="tabular-nums text-slate-500">
                      {formatDays(line.cvdEst)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <OrderSummaryPromo line={line} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
