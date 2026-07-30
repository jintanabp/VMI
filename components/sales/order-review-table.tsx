"use client";

import { appPath } from "@/lib/paths";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Filter, Sparkles } from "lucide-react";
import { PromoDetailCell } from "@/components/promo/promo-detail-cell";
import { FlagBadge, PriceFlagBadge } from "@/components/ui/badge";
import {
  MobileRow,
  MobileRowExtra,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import {
  calcNetUnitPrice,
  formatBaht,
  formatNumber,
  getCvdFlag,
} from "@/lib/calculations";
import type { PromoTierKind } from "@/lib/calculations";
import {
  formatQtyPair,
} from "@/lib/format-store-label";
import { cn } from "@/lib/utils";
import {
  annotatePromoGroupStripes,
  promoGroupRowBgClass,
  sortRowsByPromoGroup,
} from "@/lib/promo/promo-group-display";

export interface ReviewOrderItem {
  id: string;
  finalQty: number;
  suggestedQty: number;
  cvdEstimate: number | null;
  minDays?: number | null;
  maxDays?: number | null;
  sku: { code: string; name: string };
  // ราคาที่ร้านแก้เอง + สแนปช็อต C4 ณ เวลาส่ง (null = ออเดอร์ก่อนมีฟีเจอร์นี้)
  unitPriceOverride?: number | null;
  c4UnitPrice?: number | null;
  c4DiscountBaht?: number | null;
  c4DiscountPct?: number | null;
  c4NetUnitPrice?: number | null;
  c4PriceExpired?: boolean | null;
  priceFlagged?: boolean;
  priceFlagReason?: string | null;
}

/** ข้อความอธิบายธงราคา — สร้างจากค่าที่แช่ไว้ตอนส่ง ไม่ใช่ราคาสดวันนี้ */
function priceFlagTitle(item: ReviewOrderItem): string {
  const parts: string[] = [];
  if (item.c4UnitPrice != null) {
    parts.push(`ราคาระบบ (C4) ${formatNumber(item.c4UnitPrice, 2)}`);
  } else {
    parts.push("ระบบไม่มีราคาอ้างอิง");
  }
  if (item.unitPriceOverride != null) {
    parts.push(`ร้านกรอก ${formatNumber(item.unitPriceOverride, 2)}`);
  }
  if (item.c4UnitPrice != null && item.unitPriceOverride != null) {
    const diff = item.unitPriceOverride - item.c4UnitPrice;
    parts.push(`ต่าง ${diff > 0 ? "+" : ""}${formatNumber(diff, 2)} บาท/หีบ`);
  }
  parts.push("ณ เวลาที่ร้านส่ง");
  if (item.c4PriceExpired) parts.push("ราคาระบบหมดอายุ");
  return parts.join(" · ");
}

interface OrderReviewTableProps {
  storeCode: string;
  items: ReviewOrderItem[];
}

interface PromoApiLine {
  skuCode: string;
  qty: number;
  currentPromo?: string | null;
  nextPromo?: string | null;
  nextPromoQty?: number | null;
  qtyToNext?: number | null;
  currentKind?: PromoTierKind | null;
  nextKind?: PromoTierKind | null;
  hasPromoLadder?: boolean;
  promoGroup?: string | null;
  promoGroupMembers?: number;
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  priceExpired: boolean;
  freeGood?: {
    premiumProduct: string;
    premiumName: string;
    qty: number;
    unit: string;
    unitLabel: string;
    tierFromQty: number;
    tierPremiumQty: number;
    pooledQty?: number;
    lineQty?: number;
  } | null;
}

function hasActivePromo(api: PromoApiLine | undefined) {
  return Boolean(api?.currentPromo || api?.freeGood);
}

function PriceBlock({
  unitPrice,
  netUnitPrice,
  lineTotal,
  expired,
  item,
  qty,
}: {
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  expired?: boolean;
  /** มีเมื่อร้านแก้ราคา — แสดงตัวเลขของร้านแทนราคาสดจาก API */
  item?: ReviewOrderItem;
  qty?: number;
}) {
  const override = item?.unitPriceOverride ?? null;

  // ร้านแก้ราคา → โชว์ตัวเลขที่ร้านตั้งใจ คำนวณจากสแนปช็อต C4 ณ เวลาส่ง
  // (ไม่ใช้ lineTotal จาก API ซึ่งคิดจากราคา master วันนี้)
  if (override != null) {
    const effNet =
      calcNetUnitPrice(override, item?.c4DiscountBaht, item?.c4DiscountPct) ??
      override;
    const effTotal = qty != null ? effNet * qty : null;
    const hasDiscount = effNet < override - 0.001;
    return (
      <div className="text-right tabular-nums">
        <p className="whitespace-nowrap text-[11px] leading-tight text-slate-500 dark:text-slate-400">
          {item?.c4UnitPrice != null && (
            <>
              <span className="line-through">
                ระบบ {formatBaht(item.c4UnitPrice)}
              </span>
              <span className="mx-0.5 text-slate-400">→</span>
            </>
          )}
          <span className="font-bold text-amber-700 dark:text-amber-400">
            ร้าน {formatBaht(override)}
          </span>
        </p>
        {hasDiscount && (
          <p className="whitespace-nowrap text-[11px] leading-tight text-teal-700 dark:text-teal-400">
            สุทธิ {formatBaht(effNet)}
          </p>
        )}
        {effTotal != null && (
          <p className="mt-1 whitespace-nowrap text-base font-bold leading-none text-slate-900 dark:text-slate-100">
            {formatBaht(effTotal)}
          </p>
        )}
      </div>
    );
  }

  if (unitPrice == null && lineTotal == null) {
    return <span className="text-sm text-slate-400">-</span>;
  }

  const hasDiscount =
    unitPrice != null &&
    netUnitPrice != null &&
    netUnitPrice < unitPrice - 0.001;

  return (
    <div
      className={cn(
        "text-right tabular-nums",
        expired && "text-amber-600 dark:text-amber-400"
      )}
    >
      {unitPrice != null && (
        <p className="whitespace-nowrap text-[11px] leading-tight text-slate-500 dark:text-slate-400">
          {hasDiscount ? (
            <>
              <span className="line-through">{formatBaht(unitPrice)}</span>
              <span className="mx-0.5 text-slate-400">→</span>
              <span className="font-semibold text-teal-700 dark:text-teal-400">
                {formatBaht(netUnitPrice!)}
              </span>
            </>
          ) : (
            formatBaht(unitPrice)
          )}
        </p>
      )}
      {lineTotal != null && (
        <p className="mt-1 whitespace-nowrap text-base font-bold leading-none text-slate-900 dark:text-slate-100">
          {formatBaht(lineTotal)}
        </p>
      )}
    </div>
  );
}

export function OrderReviewTable({ storeCode, items }: OrderReviewTableProps) {
  const [promoOnly, setPromoOnly] = useState(false);
  const lineKey = items.map((i) => `${i.sku.code}:${i.finalQty}`).join("|");

  const { data: promoData, isLoading: promoLoading } = useQuery<{
    lines: PromoApiLine[];
    orderTotal: number | null;
  }>({
    queryKey: ["order-promo", storeCode, lineKey],
    queryFn: () =>
      fetch(appPath("/api/sales/order-promo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeCode,
          lines: items.map((i) => ({
            skuCode: i.sku.code,
            qty: i.finalQty,
          })),
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("promo lookup failed");
        return r.json();
      }),
    enabled: items.length > 0,
  });

  const promoBySku = useMemo(() => {
    const map = new Map<string, PromoApiLine>();
    for (const ln of promoData?.lines ?? []) {
      map.set(ln.skuCode, ln);
    }
    return map;
  }, [promoData?.lines]);

  const stats = useMemo(() => {
    const totalQty = items.reduce((s, i) => s + i.finalQty, 0);
    let withPromo = 0;
    let orderTotal = promoData?.orderTotal ?? 0;
    if (!promoData?.orderTotal) {
      orderTotal = 0;
      for (const item of items) {
        orderTotal += promoBySku.get(item.sku.code)?.lineTotal ?? 0;
      }
    }
    for (const item of items) {
      if (hasActivePromo(promoBySku.get(item.sku.code))) withPromo++;
    }
    const priceFlagged = items.filter((i) => i.priceFlagged).length;
    // ร้านแก้ราคาบรรทัดไหน ยอดรวมต้องคิดจากราคาของร้าน ไม่ใช่ราคา master วันนี้
    const hasOverride = items.some((i) => i.unitPriceOverride != null);
    if (hasOverride) {
      orderTotal = 0;
      for (const item of items) {
        if (item.unitPriceOverride != null) {
          const net =
            calcNetUnitPrice(
              item.unitPriceOverride,
              item.c4DiscountBaht,
              item.c4DiscountPct
            ) ?? item.unitPriceOverride;
          orderTotal += net * item.finalQty;
        } else {
          orderTotal += promoBySku.get(item.sku.code)?.lineTotal ?? 0;
        }
      }
    }
    return {
      totalQty,
      skuCount: items.length,
      withPromo,
      priceFlagged,
      orderTotal: orderTotal > 0 ? orderTotal : null,
    };
  }, [items, promoBySku, promoData?.orderTotal]);

  const visibleItems = useMemo(() => {
    if (!promoOnly) return items;
    return items.filter((item) =>
      hasActivePromo(promoBySku.get(item.sku.code))
    );
  }, [items, promoOnly, promoBySku]);

  const promoStagedQty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of items) {
      if (i.finalQty > 0) m[i.sku.code] = i.finalQty;
    }
    return m;
  }, [items]);

  const displayItems = useMemo(() => {
    const withGroup = visibleItems.map((item) => {
      const api = promoBySku.get(item.sku.code);
      return {
        ...item,
        promoGroup: api?.promoGroup ?? null,
        promoGroupMembers: api?.promoGroupMembers ?? 0,
        skuCode: item.sku.code,
      };
    });
    return annotatePromoGroupStripes(sortRowsByPromoGroup(withGroup));
  }, [visibleItems, promoBySku]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="vmi-sales-review-toolbar flex shrink-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/50">
        <CompactStat label="รายการ" value={`${stats.skuCount} SKU`} />
        <span aria-hidden className="text-slate-300 dark:text-slate-600">
          ·
        </span>
        <CompactStat
          label="รวม"
          value={`${stats.totalQty.toLocaleString("th-TH")} หีบ`}
          accent
        />
        {stats.orderTotal != null && (
          <>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <CompactStat
              label="มูลค่า"
              value={formatBaht(stats.orderTotal)}
            />
          </>
        )}
        <span aria-hidden className="text-slate-300 dark:text-slate-600">
          ·
        </span>
        <CompactStat
          label="ได้โปร"
          value={`${stats.withPromo}`}
          icon={<Sparkles className="h-3 w-3 text-violet-500" />}
        />
        {stats.priceFlagged > 0 && (
          <>
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <CompactStat
              label="แก้ราคา"
              value={`${stats.priceFlagged}`}
              icon={<AlertTriangle className="h-3 w-3 text-amber-500" />}
            />
          </>
        )}
      </div>

      <div
        role="group"
        aria-label="กรองรายการตามโปร"
        className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-800/60"
      >
        <button
          type="button"
          onClick={() => setPromoOnly(false)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors sm:text-xs",
            !promoOnly
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          ทุกรายการ ({stats.skuCount})
        </button>
        <button
          type="button"
          onClick={() => setPromoOnly(true)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors sm:text-xs",
            promoOnly
              ? "bg-violet-600 text-white shadow-sm dark:bg-violet-600"
              : "text-slate-600 hover:bg-white/60 hover:text-violet-700 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-violet-300"
          )}
        >
          <Filter className="h-3 w-3 shrink-0" />
          เฉพาะได้โปร ({stats.withPromo})
        </button>
      </div>
      </div>

      {promoLoading && (
        <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
          กำลังโหลดราคา / โปรโมชัน...
        </p>
      )}

      <div className="vmi-table-wrap flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="vmi-table-scroll vmi-sales-review-scroll min-h-0 flex-1 overflow-x-hidden xl:overflow-x-auto">
          {!promoLoading && visibleItems.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400 xl:hidden">
              {promoOnly
                ? "ไม่มีรายการที่ได้โปร"
                : "ไม่มีรายการสินค้า"}
            </p>
          )}
          <div className="xl:hidden">
            {!promoLoading && visibleItems.length > 0 && (
              <MobileRowList grid>
                {displayItems.map((item, index) => {
                  const api = promoBySku.get(item.sku.code);
                  const flag = getCvdFlag(item.cvdEstimate, item.minDays ?? undefined, item.maxDays ?? undefined);
                  const rowNum = promoOnly
                    ? index + 1
                    : items.findIndex((i) => i.id === item.id) + 1;
                  const hasPromo =
                    api?.currentPromo ||
                    api?.nextPromo ||
                    api?.hasPromoLadder ||
                    api?.freeGood;

                  return (
                    <MobileRow
                      key={item.id}
                      warn={
                        (flag === "red" || Boolean(item.priceFlagged)) &&
                        item.promoGroupStripe == null
                      }
                      className={cn(
                        promoGroupRowBgClass(item.promoGroupStripe ?? null),
                        flag === "red" && !item.promoGroupStripe && "bg-red-50/40 dark:bg-red-950/20",
                        flag !== "red" &&
                          item.priceFlagged &&
                          !item.promoGroupStripe &&
                          "bg-amber-50/40 dark:bg-amber-950/20"
                      )}
                    >
                      <MobileRowTop>
                        <span className="w-5 shrink-0 text-xs text-slate-400">
                          {rowNum}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                              {item.sku.code}
                            </span>
                            <FlagBadge flag={flag} />
                            {item.priceFlagged && (
                              <PriceFlagBadge
                                reason={item.priceFlagReason}
                                title={priceFlagTitle(item)}
                                compact
                              />
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
                            {item.sku.name}
                          </p>
                        </div>
                      </MobileRowTop>
                      <MobileRowStats className="pl-7">
                        <MobileStat
                          label="หีบ"
                          value={formatQtyPair(
                            item.suggestedQty,
                            item.finalQty
                          )}
                          title={`แนะนำ ${item.suggestedQty} · สั่ง ${item.finalQty}`}
                        />
                        <MobileStat label="มูลค่า">
                          {promoLoading ? (
                            <span className="text-slate-400">...</span>
                          ) : (
                            <PriceBlock
                              unitPrice={api?.unitPrice ?? null}
                              netUnitPrice={api?.netUnitPrice ?? null}
                              lineTotal={api?.lineTotal ?? null}
                              expired={api?.priceExpired}
                              item={item}
                              qty={item.finalQty}
                            />
                          )}
                        </MobileStat>
                      </MobileRowStats>
                      {!promoLoading && hasPromo && (
                        <MobileRowExtra className="pl-7">
                          <PromoDetailCell
                            variant="embedded"
                            currentPromo={api?.currentPromo}
                            currentKind={api?.currentKind}
                            nextPromo={api?.nextPromo}
                            qtyToNext={api?.qtyToNext}
                            nextPromoQty={api?.nextPromoQty}
                            nextKind={api?.nextKind}
                            hasPromoLadder={api?.hasPromoLadder}
                            freeGood={api?.freeGood}
                            inspector={{
                              skuCode: item.sku.code,
                              storeCode,
                              stagedQty: promoStagedQty,
                              promoGroup: item.promoGroup,
                              promoGroupMembers: item.promoGroupMembers,
                            }}
                          />
                        </MobileRowExtra>
                      )}
                    </MobileRow>
                  );
                })}
              </MobileRowList>
            )}
          </div>

          <table className="vmi-data-table hidden w-full min-w-0 text-left xl:table">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                <th className="w-9 px-2 py-2.5">#</th>
                <th className="min-w-0 px-2 py-2.5">สินค้า · โปร</th>
                <th className="w-[4.5rem] px-2 py-2.5 text-right">หีบ</th>
                <th className="w-[7rem] py-2.5 pl-2 pr-4 text-right sm:w-[7.5rem]">
                  มูลค่า
                </th>
              </tr>
            </thead>
            <tbody>
              {!promoLoading && visibleItems.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    {promoOnly
                      ? "ไม่มีรายการที่ได้โปร"
                      : "ไม่มีรายการสินค้า"}
                  </td>
                </tr>
              )}
              {displayItems.map((item, index) => {
                const api = promoBySku.get(item.sku.code);
                const flag = getCvdFlag(item.cvdEstimate, item.minDays ?? undefined, item.maxDays ?? undefined);
                const rowNum = promoOnly
                  ? index + 1
                  : items.findIndex((i) => i.id === item.id) + 1;
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "border-t border-slate-100 dark:border-slate-800",
                      promoGroupRowBgClass(item.promoGroupStripe ?? null),
                      flag === "red" &&
                        !item.promoGroupStripe &&
                        "bg-red-50/40 dark:bg-red-950/20",
                      flag !== "red" &&
                        item.priceFlagged &&
                        !item.promoGroupStripe &&
                        "bg-amber-50/40 dark:bg-amber-950/20"
                    )}
                  >
                    <td className="px-2 py-2.5 align-top text-xs text-slate-400">
                      {rowNum}
                    </td>
                    <td className="max-w-0 px-2 py-2.5 align-top">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">
                            {item.sku.code}
                          </span>
                          <FlagBadge flag={flag} />
                          {item.priceFlagged && (
                            <PriceFlagBadge
                              reason={item.priceFlagReason}
                              title={priceFlagTitle(item)}
                              compact
                            />
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
                          {item.sku.name}
                        </p>
                        {!promoLoading && (
                          <div className="mt-1.5 max-w-full">
                            <PromoDetailCell
                              variant="embedded"
                              currentPromo={api?.currentPromo}
                              currentKind={api?.currentKind}
                              nextPromo={api?.nextPromo}
                              qtyToNext={api?.qtyToNext}
                              nextPromoQty={api?.nextPromoQty}
                              nextKind={api?.nextKind}
                              hasPromoLadder={api?.hasPromoLadder}
                              freeGood={api?.freeGood}
                              inspector={{
                                skuCode: item.sku.code,
                                storeCode,
                                stagedQty: promoStagedQty,
                                promoGroup: item.promoGroup,
                                promoGroupMembers: item.promoGroupMembers,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="w-[4.5rem] px-2 py-2.5 align-top text-right">
                      <p
                        className="whitespace-nowrap text-base font-bold tabular-nums text-slate-900 dark:text-slate-100"
                        title={`แนะนำ ${item.suggestedQty} · สั่ง ${item.finalQty}`}
                      >
                        {formatQtyPair(item.suggestedQty, item.finalQty)}
                      </p>
                    </td>
                    <td className="w-[7rem] py-2.5 pl-2 pr-4 align-top text-right sm:w-[7.5rem]">
                      {promoLoading ? (
                        <span className="text-xs text-slate-400">...</span>
                      ) : (
                        <PriceBlock
                          unitPrice={api?.unitPrice ?? null}
                          netUnitPrice={api?.netUnitPrice ?? null}
                          lineTotal={api?.lineTotal ?? null}
                          expired={api?.priceExpired}
                        />
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

function CompactStat({
  label,
  value,
  icon,
  accent,
  title,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: boolean;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        accent && "text-teal-800 dark:text-teal-300"
      )}
      title={title}
    >
      {icon}
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-bold text-slate-900 dark:text-slate-100">{value}</span>
    </span>
  );
}
