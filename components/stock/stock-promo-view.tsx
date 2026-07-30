"use client";

import { memo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { PromoInspectorTrigger } from "@/components/promo/c4-promo-modal";
import {
  buildPromoInspectorProps,
  PromoDetailCell,
} from "@/components/promo/promo-detail-cell";
import { FreeGoodMobileCard } from "@/components/promo/free-good-subrow";
import { PromoLadderStrip } from "@/components/promo/promo-ladder-strip";
import { StockQtyStepper } from "@/components/stock/stock-qty-stepper";
import {
  StockCaseCell,
  StockDiscountPerCaseCell,
  StockListPriceCell,
  StockNetPriceCell,
} from "@/components/stock/stock-price-cells";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MobileRow,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import { promoGroupBadgeClass } from "@/lib/promo/promo-group-display";
import {
  activeTierAt,
  sumStagedFor,
  type PromoBucket,
} from "@/lib/promo/promo-browse";
import { isFreeGoodHostRow } from "@/lib/promo/stock-pooled-promo";
import type { StockRowComputed } from "@/lib/repositories/types";
import { cn } from "@/lib/utils";

/** เกินจำนวนนี้ในถังเดียวถึงจะตัดแสดง — กันหน้าหนักตอนกาง "ไม่มีโปรโมชั่น" ทั้งคลัง */
const ROWS_PER_BUCKET = 120;

export interface StockPromoViewProps {
  buckets: PromoBucket<StockRowComputed>[];
  storeCode: string;
  stagedQty: Record<string, number>;
  suggestByProduct: Record<string, number>;
  selectedSkuIds: ReadonlySet<string>;
  selectedSkuCodes: ReadonlySet<string>;
  qtyOf: (row: StockRowComputed) => number;
  /** ข้อความเตือนเมื่อจำนวนที่สั่งไม่เหมาะสม (null = ปกติ) — ไม่มีตัวเลข CVD */
  blockedQtyHint: (row: StockRowComputed) => string | null;
  promoApplyVersion: number;
  onToggleRow: (skuId: string) => void;
  onSetQty: (skuCode: string, qty: number) => void;
  onAdjustQty: (skuCode: string, delta: number) => void;
  onResetQty: (skuCode: string) => void;
  onConfirmStaged: (
    staged: Record<string, number>,
    memberSkus?: string[]
  ) => void;
}

export function StockPromoView(props: StockPromoViewProps) {
  const { buckets } = props;
  // ถังที่ไม่มีโปรยุบไว้ก่อน — ร้านมาที่มุมมองนี้เพื่อดูโปร ไม่ใช่ไล่ของทั้งคลัง
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(buckets.filter((b) => b.kind === "none").map((b) => b.key))
  );
  const [expandedAll, setExpandedAll] = useState<Set<string>>(new Set());

  if (buckets.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
        ไม่พบสินค้าตามเงื่อนไขที่เลือก
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1.5 sm:p-2">
      {buckets.map((bucket) => (
        <PromoBucketCard
          key={bucket.key}
          bucket={bucket}
          collapsed={collapsed.has(bucket.key)}
          showAll={expandedAll.has(bucket.key)}
          onToggleCollapse={() =>
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(bucket.key)) next.delete(bucket.key);
              else next.add(bucket.key);
              return next;
            })
          }
          onShowAll={() =>
            setExpandedAll((prev) => new Set(prev).add(bucket.key))
          }
          {...props}
        />
      ))}
    </div>
  );
}

function PromoBucketCard({
  bucket,
  collapsed,
  showAll,
  onToggleCollapse,
  onShowAll,
  storeCode,
  stagedQty,
  suggestByProduct,
  selectedSkuIds,
  selectedSkuCodes,
  qtyOf,
  blockedQtyHint,
  promoApplyVersion,
  onToggleRow,
  onSetQty,
  onAdjustQty,
  onResetQty,
  onConfirmStaged,
}: StockPromoViewProps & {
  bucket: PromoBucket<StockRowComputed>;
  collapsed: boolean;
  showAll: boolean;
  onToggleCollapse: () => void;
  onShowAll: () => void;
}) {
  const isGroup = bucket.kind === "group";
  const pooledQty = isGroup ? sumStagedFor(bucket.memberSkus, stagedQty) : 0;
  // ยอดที่ "ติ๊กเลือกแล้ว" จริง — pooledQty นับ suggestOrder ของแถวที่ยังไม่ติ๊กด้วย
  const selectedQty = isGroup
    ? sumStagedFor(
        bucket.memberSkus.filter((c) => selectedSkuCodes.has(c)),
        stagedQty
      )
    : 0;

  const pooledTier = isGroup ? activeTierAt(bucket.tiers, pooledQty) : null;
  const selectedTier = isGroup ? activeTierAt(bucket.tiers, selectedQty) : null;
  // เตือนเฉพาะตอนร้าน "เริ่มติ๊กแล้วแต่ยังไม่ครบ" — ถ้ายังไม่ติ๊กอะไรเลยแปลว่า
  // ยังไม่ได้เลือกของ ไม่ใช่ความผิดพลาด เตือนไปก็เป็น noise ทุกการ์ด
  const tierGap =
    isGroup &&
    selectedQty > 0 &&
    pooledTier != null &&
    pooledTier.minQty !== selectedTier?.minQty;

  const hiddenByFilter = bucket.totalRows - bucket.rows.length;
  const rows = showAll ? bucket.rows : bucket.rows.slice(0, ROWS_PER_BUCKET);
  const truncated = bucket.rows.length - rows.length;

  const stripeBorder =
    bucket.stripe === 0
      ? "border-l-violet-400 dark:border-l-violet-500"
      : bucket.stripe === 1
        ? "border-l-sky-400 dark:border-l-sky-500"
        : bucket.stripe === 2
          ? "border-l-emerald-400 dark:border-l-emerald-500"
          : bucket.stripe === 3
            ? "border-l-amber-400 dark:border-l-amber-500"
            : "border-l-slate-200 dark:border-l-slate-700";

  return (
    <section
      className={cn(
        "vmi-cv-auto overflow-hidden rounded-xl border border-l-[3px] border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        stripeBorder
      )}
      style={{ containIntrinsicSize: "auto 420px" }}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          aria-label={collapsed ? "กางรายการ" : "ยุบรายการ"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {isGroup ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1",
              promoGroupBadgeClass(bucket.stripe)
            )}
          >
            กลุ่ม {bucket.title}
          </span>
        ) : (
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {bucket.title}
          </span>
        )}

        <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          {bucket.totalRows} รายการ
        </span>

        {isGroup && (
          <span className="text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-300">
            รวม {pooledQty} หีบ
          </span>
        )}

        {/* ต่างจาก PromoGroupHeader ตรงที่เปิดดูบันไดได้ก่อนใส่จำนวน —
            มุมมองนี้มีไว้ให้ร้านเลือกของ *จาก* โปร ไม่ใช่ดูโปรหลังใส่จำนวนแล้ว */}
        {isGroup && storeCode && bucket.hostRow && (
          <PromoInspectorTrigger
            skuCode={bucket.hostRow.skuCode}
            storeCode={storeCode}
            promoGroup={bucket.promoGroup ?? undefined}
            stagedQty={stagedQty}
            onConfirmStaged={(staged) =>
              onConfirmStaged(staged, bucket.memberSkus)
            }
            suggestByProduct={suggestByProduct}
            applyVersion={promoApplyVersion}
            stockMemberSkus={bucket.memberSkus}
            label="โปรกลุ่ม"
          />
        )}

        {hiddenByFilter > 0 && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            · ซ่อนตามตัวกรอง {hiddenByFilter} รายการ
          </span>
        )}

        {isGroup && bucket.tiers.length > 0 && (
          <PromoLadderStrip
            tiers={bucket.tiers}
            pooledQty={pooledQty}
            className="w-full sm:ml-auto sm:w-auto"
          />
        )}

        {tierGap && (
          <span className="inline-flex w-full items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            ยอดรวม {pooledQty} หีบได้โปรขั้นนี้ แต่ติ๊กเลือกไว้ {selectedQty} หีบ
            — ติ๊กให้ครบ {pooledTier?.minQty} หีบเพื่อได้โปรจริง
          </span>
        )}
      </header>

      {!collapsed && (
        <>
          {/* Desktop */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-9" />
                <col />
                <col className="w-[7rem]" />
                <col className="w-[6rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[7rem]" />
                <col className="w-[9rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  <th />
                  <th className="px-2 py-1 text-left">สินค้า</th>
                  <th className="px-2 py-1 text-right">สต็อก หีบ/เศษ</th>
                  <th className="px-2 py-1 text-right">ราคา/หีบ</th>
                  <th className="px-2 py-1 text-right">ส่วนลด</th>
                  <th className="px-2 py-1 text-right">สุทธิ/หีบ</th>
                  <th className="px-2 py-1 text-center">จำนวนสั่ง</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <PromoSkuRow
                    key={row.skuId}
                    row={row}
                    showPromoCell={bucket.kind === "single"}
                    showFreeGood={isFreeGoodHostRow(rows, index)}
                    selected={selectedSkuIds.has(row.skuId)}
                    qty={qtyOf(row)}
                    blockedHint={blockedQtyHint(row)}
                    storeCode={storeCode}
                    stagedQty={stagedQty}
                    suggestByProduct={suggestByProduct}
                    onConfirmStaged={onConfirmStaged}
                    onToggleRow={onToggleRow}
                    onSetQty={onSetQty}
                    onAdjustQty={onAdjustQty}
                    onResetQty={onResetQty}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — ไม่ใช้ grid เพื่อให้สมาชิกกลุ่มเรียงต่อกันเป็นคอลัมน์เดียว */}
          <div className="lg:hidden">
            <MobileRowList>
              {rows.map((row) => (
                <PromoSkuMobileRow
                  key={row.skuId}
                  row={row}
                  showPromoCell={bucket.kind === "single"}
                  selected={selectedSkuIds.has(row.skuId)}
                  qty={qtyOf(row)}
                  blockedHint={blockedQtyHint(row)}
                  storeCode={storeCode}
                  stagedQty={stagedQty}
                  suggestByProduct={suggestByProduct}
                  onConfirmStaged={onConfirmStaged}
                  onToggleRow={onToggleRow}
                  onSetQty={onSetQty}
                  onAdjustQty={onAdjustQty}
                  onResetQty={onResetQty}
                />
              ))}
            </MobileRowList>
          </div>

          {truncated > 0 && (
            <button
              type="button"
              onClick={onShowAll}
              className="w-full border-t border-slate-100 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50/60 dark:border-slate-800 dark:text-teal-400 dark:hover:bg-teal-950/30"
            >
              แสดงทั้งหมด ({bucket.rows.length} รายการ)
            </button>
          )}
        </>
      )}
    </section>
  );
}

interface SkuRowProps {
  row: StockRowComputed;
  showPromoCell: boolean;
  selected: boolean;
  qty: number;
  blockedHint: string | null;
  storeCode: string;
  stagedQty: Record<string, number>;
  suggestByProduct: Record<string, number>;
  onConfirmStaged: (
    staged: Record<string, number>,
    memberSkus?: string[]
  ) => void;
  onToggleRow: (skuId: string) => void;
  onSetQty: (skuCode: string, qty: number) => void;
  onAdjustQty: (skuCode: string, delta: number) => void;
  onResetQty: (skuCode: string) => void;
}

const PromoSkuRow = memo(function PromoSkuRow({
  row,
  showPromoCell,
  showFreeGood,
  selected,
  qty,
  blockedHint,
  storeCode,
  stagedQty,
  suggestByProduct,
  onConfirmStaged,
  onToggleRow,
  onSetQty,
  onAdjustQty,
  onResetQty,
}: SkuRowProps & { showFreeGood: boolean }) {
  return (
    <>
      <tr
        data-sku-code={row.skuCode}
        className={cn(
          "border-b border-slate-50 last:border-0 dark:border-slate-800/60",
          selected && "bg-teal-50/60 dark:bg-teal-950/20"
        )}
      >
        <td className="px-2 py-2 align-top">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleRow(row.skuId)}
            aria-label={`เลือก ${row.skuCode}`}
          />
        </td>
        <td className="px-2 py-2 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">
              {row.skuCode}
            </span>
            {row.isNew && (
              <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                ใหม่
              </span>
            )}
            {row.blocked && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                หยุดสั่ง
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-slate-800 dark:text-slate-200">
            {row.skuName}
          </p>
          {showPromoCell && (
            <div className="mt-1 max-w-full">
              <PromoDetailCell
                variant="compact"
                currentPromo={row.currentPromo}
                currentKind={row.currentPromoKind}
                nextPromo={row.nextPromo}
                nextPromoQty={row.nextPromoQty}
                qtyToNext={row.qtyToNext}
                nextKind={row.nextPromoKind}
                hasPromoLadder={row.hasPromoLadder}
                tiers={row.promoTiers}
                endsInDays={row.currentPromoEndsInDays}
                freeGood={row.freeGood}
                showFreeGoodChip={false}
                showGroupChip={false}
                onApplyNext={(q) => onSetQty(row.skuCode, q)}
                inspector={buildPromoInspectorProps(row, {
                  storeCode,
                  stagedQty,
                  onConfirmStaged,
                  suggestByProduct,
                })}
              />
            </div>
          )}
        </td>
        <td className="px-2 py-2 text-right align-top">
          <StockCaseCell
            cases={row.stockCases}
            remainder={row.stockRemainder}
            pieces={row.stockPieces}
            packSize={row.packSize}
            compact
          />
        </td>
        <td className="px-2 py-2 text-right align-top">
          <StockListPriceCell
            unitPrice={row.unitPrice}
            expired={row.priceExpired}
            compact
          />
        </td>
        <td className="px-2 py-2 text-right align-top">
          <StockDiscountPerCaseCell
            discountBaht={row.discountBahtPerCase}
            discountPct={row.discountPctPerCase}
            compact
          />
        </td>
        <td className="px-2 py-2 text-right align-top">
          <StockNetPriceCell
            unitPrice={row.unitPrice}
            netUnitPrice={row.netUnitPrice}
            expired={row.priceExpired}
            compact
          />
        </td>
        <td className="px-2 py-2 align-top">
          <div className="flex items-center justify-center gap-1">
            {blockedHint && (
              <span title={blockedHint} className="shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </span>
            )}
            <StockQtyStepper
              qty={qty}
              suggestOrder={row.suggestOrder}
              onMinus={() => onAdjustQty(row.skuCode, -1)}
              onPlus={() => onAdjustQty(row.skuCode, 1)}
              onSetQty={(q) => onSetQty(row.skuCode, q)}
              onApplySuggest={() => onResetQty(row.skuCode)}
              compact
            />
          </div>
        </td>
      </tr>
      {showFreeGood && row.freeGood && (
        <tr>
          <td colSpan={7} className="px-2 pb-2">
            <FreeGoodMobileCard freeGood={row.freeGood} />
          </td>
        </tr>
      )}
    </>
  );
});

const PromoSkuMobileRow = memo(function PromoSkuMobileRow({
  row,
  showPromoCell,
  selected,
  qty,
  blockedHint,
  storeCode,
  stagedQty,
  suggestByProduct,
  onConfirmStaged,
  onToggleRow,
  onSetQty,
  onAdjustQty,
  onResetQty,
}: SkuRowProps) {
  return (
    <MobileRow
      data-sku-code={row.skuCode}
      className={cn(selected && "bg-teal-50/60 dark:bg-teal-950/20")}
    >
      <MobileRowTop>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleRow(row.skuId)}
          aria-label={`เลือก ${row.skuCode}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
              {row.skuCode}
            </span>
            {row.isNew && (
              <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                ใหม่
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-slate-800 dark:text-slate-200">
            {row.skuName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {blockedHint && (
            <span title={blockedHint}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </span>
          )}
          <StockQtyStepper
            qty={qty}
            suggestOrder={row.suggestOrder}
            onMinus={() => onAdjustQty(row.skuCode, -1)}
            onPlus={() => onAdjustQty(row.skuCode, 1)}
            onSetQty={(q) => onSetQty(row.skuCode, q)}
            onApplySuggest={() => onResetQty(row.skuCode)}
            compact
          />
        </div>
      </MobileRowTop>

      <MobileRowStats className="pl-7">
        <MobileStat label="สต็อก · หีบ/เศษ">
          <StockCaseCell
            cases={row.stockCases}
            remainder={row.stockRemainder}
            pieces={row.stockPieces}
            packSize={row.packSize}
            compact
          />
        </MobileStat>
        <MobileStat label="ราคา/หีบ">
          <StockListPriceCell
            unitPrice={row.unitPrice}
            expired={row.priceExpired}
            compact
          />
        </MobileStat>
        <MobileStat label="ส่วนลด">
          <StockDiscountPerCaseCell
            discountBaht={row.discountBahtPerCase}
            discountPct={row.discountPctPerCase}
            compact
          />
        </MobileStat>
        <MobileStat label="สุทธิ/หีบ">
          <StockNetPriceCell
            unitPrice={row.unitPrice}
            netUnitPrice={row.netUnitPrice}
            expired={row.priceExpired}
            compact
          />
        </MobileStat>
      </MobileRowStats>

      {showPromoCell && (
        <div className="px-2 pb-2 pl-7">
          <PromoDetailCell
            variant="card"
            currentPromo={row.currentPromo}
            currentKind={row.currentPromoKind}
            nextPromo={row.nextPromo}
            nextPromoQty={row.nextPromoQty}
            qtyToNext={row.qtyToNext}
            nextKind={row.nextPromoKind}
            hasPromoLadder={row.hasPromoLadder}
            tiers={row.promoTiers}
            endsInDays={row.currentPromoEndsInDays}
            freeGood={row.freeGood}
            showGroupChip={false}
            onApplyNext={(q) => onSetQty(row.skuCode, q)}
            inspector={buildPromoInspectorProps(row, {
              storeCode,
              stagedQty,
              onConfirmStaged,
              suggestByProduct,
            })}
          />
        </div>
      )}
    </MobileRow>
  );
});
