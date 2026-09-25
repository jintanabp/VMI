"use client";

import { appPath } from "@/lib/paths";
import { StorePriceInput } from "@/components/order/store-price-input";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Filter,
  Maximize2,
  Minimize2,
  PackagePlus,
  Pencil,
  Sparkles,
  XCircle,
} from "lucide-react";
import { PromoDetailCell } from "@/components/promo/promo-detail-cell";
import { RejectItemModal } from "@/components/sales/reject-item-modal";
import { AddOrderItemModal } from "@/components/sales/add-order-item-modal";
import {
  DiscountFlagBadge,
  FlagBadge,
  NoTargetBadge,
  PendingQtyIncreaseBadge,
  PriceFlagBadge,
} from "@/components/ui/badge";
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
  resolveOrderLinePrice,
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
  promoGroupBadgeClass,
  promoGroupRowBgClass,
  sortRowsByPromoGroup,
} from "@/lib/promo/promo-group-display";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch } from "@/lib/api-fetch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export interface ReviewOrderItem {
  id: string;
  finalQty: number;
  suggestedQty: number;
  /// finalQty ที่ร้านส่งมาตอนแรก (null = ออเดอร์เก่าก่อนมีฟีเจอร์นี้) — ใช้เทียบว่าพนักงาน
  /// แก้จำนวนไปจากที่ร้านขอไหม สำหรับเสนอแยก PO อัตโนมัติ
  requestedQty?: number | null;
  /** จำนวนล่าสุดที่ร้านตกลงแล้ว (ดู schema) */
  agreedQty?: number | null;
  cvdEstimate: number | null;
  minDays?: number | null;
  maxDays?: number | null;
  sku: { code: string; name: string };
  /** ชิ้นต่อหีบ จากมาสเตอร์สินค้า — API แปะให้ ไม่ได้มาจาก field ในฐานข้อมูล */
  packSize?: number;
  /** อยู่ในเป้าขายเดือนนี้ไหม (cross_target) — null = เป้าขายยังไม่พร้อม/โหลดไม่สำเร็จ */
  hasTarget?: boolean | null;
  /** กลุ่มสินค้า (Section) จากมาสเตอร์สินค้า — ใช้กรองบนหน้านี้เท่านั้น */
  section?: string;
  // ราคาที่ร้านแก้เอง + สแนปช็อต C4 ณ เวลาส่ง (null = ออเดอร์ก่อนมีฟีเจอร์นี้)
  unitPriceOverride?: number | null;
  c4UnitPrice?: number | null;
  c4DiscountBaht?: number | null;
  c4DiscountPct?: number | null;
  c4NetUnitPrice?: number | null;
  c4PriceExpired?: boolean | null;
  priceFlagged?: boolean;
  priceFlagReason?: string | null;
  /** สมาชิกกลุ่มโปรเดียวกันในออเดอร์นี้ได้ส่วนลด/pooledQty ไม่ตรงกัน */
  discountFlagged?: boolean;
  discountFlagReason?: string | null;
  /** ราคาที่พนักงานตั้งเอง (แยกช่องจากของร้าน เพื่อไม่ทับหลักฐานว่าร้านขออะไร) */
  salesPriceOverride?: number | null;
  salesPriceBy?: string | null;
  /** กลุ่ม PO ที่จัดไว้ ("A".."Z") */
  poGroup?: string | null;
  /** พนักงานปฏิเสธรายการนี้ (คนละอันกับปฏิเสธทั้งใบ) — finalQty ถูกตั้งเป็น 0 ไปแล้ว */
  rejectedAt?: string | null;
  rejectReason?: string | null;
  /** พนักงานเพิ่มจำนวนเกินที่ร้านขอ รอร้านยืนยัน — ห้ามอนุมัติทั้งใบจนกว่าจะครบ */
  qtyIncreasePendingConfirm?: boolean;
  /** กลุ่มโปรที่แช่ไว้ตอนส่ง — ใช้บังคับ "เลือกทั้งกลุ่ม" ตอนอนุมัติบางรายการ */
  c4PromoGroup?: string | null;
  c4PromoGroupMembers?: number | null;
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

/** ข้อความอธิบายธงส่วนลดกลุ่ม — คำนวณตอนส่ง ไม่คำนวณใหม่ตอนอ่าน (เหตุผลเดียวกับราคา) */
function discountFlagTitle(item: ReviewOrderItem): string {
  return item.discountFlagReason === "pooled_qty_mismatch"
    ? "ยอดรวมที่ใช้ตัดสินขั้นโปรของสมาชิกกลุ่มนี้ไม่ตรงกับยอดที่สั่งจริง — ตรวจสอบก่อนอนุมัติ"
    : "สมาชิกกลุ่มโปรเดียวกันในออเดอร์นี้ได้ส่วนลด/ป้ายโปรไม่ตรงกัน — ตรวจสอบก่อนอนุมัติ";
}

interface OrderReviewTableProps {
  storeCode: string;
  items: ReviewOrderItem[];
  /** แก้ราคาได้เมื่อส่งมา (หน้าตรวจของพนักงาน) — null = ล้างราคาที่ตั้งไว้ */
  onPriceChange?: (itemId: string, override: number | null) => void;
  /**
   * แก้จำนวนรายบรรทัดก่อนอนุมัติ — API `action:"updateQty"` มีมานานแล้วแต่ไม่มีปุ่ม
   * ให้กด ต้องยิงเองผ่าน curl · ตั้ง 0 = ตัดบรรทัดนั้นออกจากใบสั่งซื้อ
   */
  onQtyChange?: (itemId: string, finalQty: number) => void;
  /** เลือกแถวเพื่อย้ายกลุ่ม PO */
  selectedIds?: Set<string>;
  onToggleSelect?: (itemId: string) => void;
  /** เลือกหลายแถวพร้อมกัน (ปุ่ม "เลือกทั้งหมดที่กรองอยู่") — เสริมจาก onToggleSelect ทีละแถว */
  onSelectMany?: (itemIds: string[]) => void;
  /** ปฏิเสธรายการเดียว (คนละอันกับปฏิเสธทั้งใบ) — ไม่ส่งมา = ไม่แสดงปุ่ม */
  onRejectItem?: (itemId: string, reason: string) => void;
  /** เพิ่มสินค้าใหม่ (SKU ที่ไม่เคยอยู่ในออเดอร์) — ไม่ส่งมา = ไม่แสดงปุ่ม */
  onAddItem?: (skuCode: string, finalQty: number) => void;
  addItemPending?: boolean;
  /** โหมดขยายตาราง (ซ่อนรายการออเดอร์ทางซ้าย) — ไม่ส่ง = ไม่มีปุ่ม */
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** true = แสดงคอลัมน์/ป้ายกลุ่ม PO */
  showPoGroups?: boolean;
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

/** ป้ายกลุ่ม PO — ใช้ระบบสีเดียวกับกลุ่มโปรที่ผู้ใช้คุ้นจากหน้า stock */
function PoGroupBadge({ groupKey }: { groupKey: string }) {
  const stripe = ((groupKey.charCodeAt(0) - 65) % 4) as 0 | 1 | 2 | 3;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[10px] font-bold ring-1",
        promoGroupBadgeClass(stripe)
      )}
      title={`อยู่ใน PO-${groupKey}`}
    >
      PO-{groupKey}
    </span>
  );
}

function hasActivePromo(api: PromoApiLine | undefined) {
  return Boolean(api?.currentPromo || api?.freeGood);
}

/**
 * ราคาของบรรทัดจากค่าที่แช่ไว้ตอนร้านส่ง — ชุดเดียวกับที่ออกเอกสาร PO (approve-with-split /
 * toSplittable): ราคาที่มีผล (พนักงาน → ร้าน → C4 ตอนส่ง) แล้วหักส่วนลด C4 ที่แช่ไว้
 *
 * เดิมตารางใช้ราคา/ส่วนลดจาก C4 "วันนี้" แต่ปุ่มอนุมัติ/แผงแบ่ง PO ใช้ค่าที่แช่ไว้ หน้าเดียวกันจึงมี
 * มูลค่าสองตัวไม่ตรงกัน (ผู้ใช้ตัดสิน 25 ก.ย. 69: ตารางใช้ค่าที่จะขึ้น PO)
 */
function linePrice(item: ReviewOrderItem) {
  const storeOverride = item.unitPriceOverride ?? null;
  const salesOverride = item.salesPriceOverride ?? null;
  const { unitPrice } = resolveOrderLinePrice({
    salesPriceOverride: salesOverride,
    unitPriceOverride: storeOverride,
    c4UnitPrice: item.c4UnitPrice,
  });
  const net =
    unitPrice != null
      ? (calcNetUnitPrice(unitPrice, item.c4DiscountBaht, item.c4DiscountPct) ?? unitPrice)
      : null;
  return {
    base: unitPrice,
    net,
    total: net != null ? net * item.finalQty : null,
    setBy:
      salesOverride != null ? ("เซลล์" as const) : storeOverride != null ? ("ร้าน" as const) : null,
    system: salesOverride != null || storeOverride != null ? (item.c4UnitPrice ?? null) : null,
  };
}

function UnitPriceCell({
  item,
  expired,
  editing,
  onEdit,
  onPriceChange,
}: {
  item: ReviewOrderItem;
  expired?: boolean;
  editing: boolean;
  onEdit?: (open: boolean) => void;
  onPriceChange?: (override: number | null) => void;
}) {
  const p = linePrice(item);
  if (editing && onPriceChange) {
    return (
      <div className="flex flex-col items-end gap-1">
        <StorePriceInput
          compact
          value={item.salesPriceOverride ?? null}
          c4UnitPrice={item.unitPriceOverride ?? item.c4UnitPrice ?? null}
          expired={item.c4PriceExpired ?? false}
          mismatch={item.priceFlagged ?? false}
          onChange={(v) => {
            onPriceChange(v);
            onEdit?.(false);
          }}
        />
        <button
          type="button"
          onClick={() => onEdit?.(false)}
          className="text-[11px] text-slate-400 hover:text-slate-600"
        >
          ปิด
        </button>
      </div>
    );
  }
  if (p.base == null) return <span className="text-sm text-slate-400">-</span>;
  const hasDiscount = p.net != null && p.net < p.base - 0.001;
  return (
    <div className={cn("text-right tabular-nums", expired && "text-amber-600 dark:text-amber-400")}>
      {(hasDiscount || p.setBy) && (
        <p className="text-[11px] leading-tight whitespace-nowrap text-slate-400">
          {p.setBy && p.system != null && (
            <span className="line-through">{formatBaht(p.system)}</span>
          )}
          {p.setBy && (
            <span
              className={cn(
                "ml-1 font-semibold",
                p.setBy === "เซลล์" ? "text-indigo-600 dark:text-indigo-300" : "text-amber-700 dark:text-amber-400"
              )}
            >
              {p.setBy} {formatBaht(p.base)}
            </span>
          )}
          {!p.setBy && hasDiscount && <span className="line-through">{formatBaht(p.base)}</span>}
        </p>
      )}
      <p className="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-slate-800 dark:text-slate-100">
        {formatBaht(p.net ?? p.base)}
        {onPriceChange && (
          <button
            type="button"
            onClick={() => onEdit?.(true)}
            className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            title="แก้ราคา/หีบ"
            aria-label={`แก้ราคา ${item.sku.code}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </p>
    </div>
  );
}

function PriceBlock({
  unitPrice,
  netUnitPrice,
  lineTotal,
  expired,
  item,
  qty,
  onPriceChange,
}: {
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  expired?: boolean;
  /** มีเมื่อร้าน/พนักงานแก้ราคา — แสดงตัวเลขที่ตั้งไว้แทนราคาสดจาก API */
  item?: ReviewOrderItem;
  qty?: number;
  /** ส่งมาเมื่อพนักงานแก้ราคาได้ */
  onPriceChange?: (override: number | null) => void;
}) {
  const storeOverride = item?.unitPriceOverride ?? null;
  const salesOverride = item?.salesPriceOverride ?? null;
  // ลำดับความสำคัญ: พนักงาน → ร้าน → ราคาระบบ
  const effective = salesOverride ?? storeOverride;

  const editor = onPriceChange ? (
    <div className="mt-1 flex justify-end">
      <StorePriceInput
        compact
        value={salesOverride}
        // ค่าอ้างอิงตอนช่องว่าง = ราคาที่ร้านขอ ถ้าไม่มีก็ราคาระบบ
        c4UnitPrice={storeOverride ?? item?.c4UnitPrice ?? null}
        expired={item?.c4PriceExpired ?? false}
        mismatch={item?.priceFlagged ?? false}
        onChange={onPriceChange}
      />
    </div>
  ) : null;

  // มีคนแก้ราคา → โชว์ตัวเลขที่ตั้งใจ คำนวณจากสแนปช็อต C4 ณ เวลาส่ง
  // (ไม่ใช้ lineTotal จาก API ซึ่งคิดจากราคา master วันนี้)
  if (effective != null) {
    const effNet =
      calcNetUnitPrice(effective, item?.c4DiscountBaht, item?.c4DiscountPct) ??
      effective;
    const effTotal = qty != null ? effNet * qty : null;
    const hasDiscount = effNet < effective - 0.001;
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
          {storeOverride != null && (
            <span
              className={cn(
                "font-bold",
                salesOverride != null
                  ? "text-slate-400 line-through dark:text-slate-500"
                  : "text-amber-700 dark:text-amber-400"
              )}
            >
              ร้าน {formatBaht(storeOverride)}
            </span>
          )}
          {salesOverride != null && (
            <>
              {storeOverride != null && (
                <span className="mx-0.5 text-slate-400">→</span>
              )}
              <span className="font-bold text-indigo-700 dark:text-indigo-300">
                เซลล์ {formatBaht(salesOverride)}
              </span>
            </>
          )}
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
        {editor}
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
      {editor}
    </div>
  );
}

export function OrderReviewTable({
  storeCode,
  items,
  onPriceChange,
  onQtyChange,
  selectedIds,
  onToggleSelect,
  onSelectMany,
  onRejectItem,
  onAddItem,
  addItemPending,
  expanded,
  onToggleExpand,
  showPoGroups,
}: OrderReviewTableProps) {
  const [promoOnly, setPromoOnly] = useState(false);
  const [sectionFilter, setSectionFilter] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  /** แถวที่กำลังแก้ราคา — ช่องแก้ราคาโผล่เฉพาะตอนกดดินสอ ไม่ค้างทุกแถว */
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [rejectPromptItem, setRejectPromptItem] = useState<ReviewOrderItem | null>(
    null
  );
  const lineKey = items.map((i) => `${i.sku.code}:${i.finalQty}`).join("|");

  /**
   * หน่วง 350ms ก่อนถามราคาใหม่ — ฝั่งร้านค้าทำแบบนี้อยู่แล้ว (order-page-client)
   *
   * ไม่มีการหน่วง การกดปุ่ม −/+ ทุกครั้งจะเปลี่ยน queryKey ทั้งก้อน react-query
   * จึงถือว่าเป็นคิวรีใหม่ (isLoading ไม่ใช่ isFetching) ผลคือคอลัมน์มูลค่า
   * "ทุกแถว" กลายเป็น "..." และบล็อกโปรหายแล้วโผล่ใหม่ทุกครั้งที่กดหนึ่งที
   */
  const debouncedLineKey = useDebouncedValue(lineKey, 350);

  const { data: promoData, isLoading: promoLoading } = useQuery<{
    lines: PromoApiLine[];
    orderTotal: number | null;
  }>({
    queryKey: ["order-promo", storeCode, debouncedLineKey],
    // คงผลเดิมไว้ระหว่างรอชุดใหม่ — ตัวเลขเก่าดีกว่าช่องว่างที่กะพริบ
    placeholderData: (prev) => prev,
    queryFn: () =>
      apiFetch(appPath("/api/sales/order-promo"), {
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
    for (const item of items) {
      if (hasActivePromo(promoBySku.get(item.sku.code))) withPromo++;
    }
    const priceFlagged = items.filter((i) => i.priceFlagged).length;
    // ค่าที่แช่ไว้ = ยอดเดียวกับที่ออก PO (ดู linePrice)
    let orderTotal = 0;
    for (const item of items) orderTotal += linePrice(item).total ?? 0;
    return {
      totalQty,
      skuCount: items.length,
      withPromo,
      priceFlagged,
      orderTotal: orderTotal > 0 ? orderTotal : null,
    };
  }, [items, promoBySku]);

  const sections = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.section) set.add(item.section);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "th"));
  }, [items]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (promoOnly && !hasActivePromo(promoBySku.get(item.sku.code))) {
        return false;
      }
      if (sectionFilter && item.section !== sectionFilter) return false;
      return true;
    });
  }, [items, promoOnly, promoBySku, sectionFilter]);

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
        {/* แถบสรุปซ้ำกับยอดในแถบปุ่มอนุมัติ — ซ่อนตอนขยายตาราง (vmi-review-summary) */}
        <div className="vmi-review-summary flex flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/50">
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
              label="ราคาต่างระบบ"
              value={`${stats.priceFlagged}`}
              icon={<AlertTriangle className="h-3 w-3 text-amber-500" />}
            />
          </>
        )}
      </div>

      {/* แถวเครื่องมือเดียว: ตัวกรองซ้าย · ปุ่มเพิ่มสินค้าขวา — เดิมแยก 3 แถวซ้อนกันจนตารางถูกดันลง */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="กรองรายการตามโปร"
          className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-800/60"
        >
          <button
            type="button"
            onClick={() => setPromoOnly(false)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
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
              "flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              promoOnly
                ? "bg-violet-600 text-white shadow-sm dark:bg-violet-600"
                : "text-slate-600 hover:bg-white/60 hover:text-violet-700 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-violet-300"
            )}
          >
            <Filter className="h-3 w-3 shrink-0" />
            เฉพาะได้โปร ({stats.withPromo})
          </button>
        </div>

        {sections.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            กลุ่มสินค้า
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="h-8 max-w-[12rem] rounded-md border border-slate-300 bg-white px-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">ทั้งหมด</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {onSelectMany && sectionFilter && visibleItems.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectMany(visibleItems.map((item) => item.id))}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            เลือกทั้งหมดที่กรองอยู่ ({visibleItems.length})
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {onToggleExpand && (
            // เฉพาะจอกว้าง — จอแคบเป็นการ์ดเต็มความกว้างอยู่แล้ว
            <button
              type="button"
              onClick={onToggleExpand}
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 xl:inline-flex dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              title={
                expanded
                  ? "แสดงรายการออเดอร์ทางซ้ายกลับมา"
                  : "ซ่อนรายการออเดอร์ทางซ้าย ให้ตารางสินค้ากว้างและสูงเต็มจอ"
              }
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {expanded ? "ย่อตาราง" : "ขยายตาราง"}
            </button>
          )}
          {onAddItem && (
            <button
              type="button"
              onClick={() => setAddItemOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
            >
              <PackagePlus className="h-4 w-4" />
              เพิ่มสินค้า
            </button>
          )}
        </div>
      </div>
      </div>

      {promoLoading && (
        <p className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
          กำลังโหลดราคา / โปรโมชั่น…
        </p>
      )}

      {/* รายการสินค้า = สิ่งที่ต้องตรวจก่อนกดอนุมัติ — กรอบเด่นกว่าแผงสรุปด้านบนโดยตั้งใจ */}
      <div className="vmi-table-wrap flex min-h-0 min-w-0 flex-1 flex-col shadow-sm ring-1 ring-teal-200/70 dark:ring-teal-900/60">
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
                        (flag === "red" ||
                          Boolean(item.priceFlagged) ||
                          Boolean(item.discountFlagged)) &&
                        item.promoGroupStripe == null
                      }
                      className={cn(
                        promoGroupRowBgClass(item.promoGroupStripe ?? null),
                        flag === "red" && !item.promoGroupStripe && "bg-red-50/40 dark:bg-red-950/20",
                        flag !== "red" &&
                          (item.priceFlagged || item.discountFlagged) &&
                          !item.promoGroupStripe &&
                          "bg-amber-50/40 dark:bg-amber-950/20"
                      )}
                    >
                      <MobileRowTop>
                        <span className="w-5 shrink-0 text-xs text-slate-400">
                          {rowNum}
                        </span>
                        {onToggleSelect && (
                          <Checkbox
                            className="mt-0.5 shrink-0"
                            checked={selectedIds?.has(item.id) ?? false}
                            onCheckedChange={() => onToggleSelect(item.id)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                              {item.sku.code}
                            </span>
                            <FlagBadge flag={flag} />
                            {showPoGroups && item.poGroup && (
                              <PoGroupBadge groupKey={item.poGroup} />
                            )}
                            {item.priceFlagged && (
                              <PriceFlagBadge
                                reason={item.priceFlagReason}
                                title={priceFlagTitle(item)}
                                compact
                              />
                            )}
                            {item.discountFlagged && (
                              <DiscountFlagBadge
                                reason={item.discountFlagReason}
                                title={discountFlagTitle(item)}
                                compact
                              />
                            )}
                            {item.hasTarget === false && (
                              <NoTargetBadge compact />
                            )}
                            {item.qtyIncreasePendingConfirm && (
                              <PendingQtyIncreaseBadge compact newItem={item.requestedQty === 0 && !item.agreedQty} />
                            )}
                            {item.rejectedAt ? (
                              <span
                                className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                title={item.rejectReason || undefined}
                              >
                                <XCircle className="h-3 w-3" />
                                ปฏิเสธแล้ว
                              </span>
                            ) : (
                              onRejectItem &&
                              item.finalQty > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setRejectPromptItem(item)}
                                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                  title="ปฏิเสธรายการนี้"
                                >
                                  <XCircle className="h-3 w-3" />
                                  ปฏิเสธ
                                </button>
                              )
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-100">
                            {item.sku.name}
                          </p>
                        </div>
                      </MobileRowTop>
                      <MobileRowStats className="pl-7">
                        <MobileStat
                          label="ชิ้น/หีบ"
                          value={formatNumber(item.packSize ?? 1, 0)}
                        />
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
                              unitPrice={linePrice(item).base}
                              netUnitPrice={linePrice(item).net}
                              lineTotal={linePrice(item).total}
                              expired={api?.priceExpired}
                              item={item}
                              qty={item.finalQty}
                              onPriceChange={
                                onPriceChange
                                  ? (v) => onPriceChange(item.id, v)
                                  : undefined
                              }
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

          {/* เดสก์ท็อป: คอลัมน์แยกชัด แถวเตี้ย — เดิมทุกอย่างกองในคอลัมน์ "สินค้า" แถวสูง ~115px
              จอ 900px เห็นแค่ 2 รายการก่อนกดอนุมัติ */}
          <table className="vmi-data-table vmi-review-table hidden w-full min-w-0 text-left xl:table">
            <thead>
              <tr className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="w-9 px-2 py-2">#</th>
                <th className="min-w-0 px-2 py-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    รายการสินค้า
                  </span>{" "}
                  <span className="font-normal text-slate-400">({displayItems.length})</span>
                </th>
                <th className="w-[13rem] px-2 py-2">โปร</th>
                <th className="w-[6.5rem] px-2 py-2 text-right">หีบ</th>
                <th className="w-[7rem] px-2 py-2 text-right whitespace-nowrap">ราคา/หีบ</th>
                <th className="w-[7.5rem] px-2 py-2 text-right">มูลค่า</th>
                {onRejectItem && <th className="w-10 px-1 py-2" aria-label="ปฏิเสธรายการ" />}
              </tr>
            </thead>
            <tbody>
              {!promoLoading && visibleItems.length === 0 && (
                <tr>
                  <td
                    colSpan={onRejectItem ? 7 : 6}
                    className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    {promoOnly ? "ไม่มีรายการที่ได้โปร" : "ไม่มีรายการสินค้า"}
                  </td>
                </tr>
              )}
              {displayItems.map((item, index) => {
                const api = promoBySku.get(item.sku.code);
                const flag = getCvdFlag(item.cvdEstimate, item.minDays ?? undefined, item.maxDays ?? undefined);
                const rowNum = promoOnly
                  ? index + 1
                  : items.findIndex((i) => i.id === item.id) + 1;
                const selectedRow = selectedIds?.has(item.id) ?? false;
                const zero = item.finalQty === 0;
                const total = linePrice(item).total;
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "border-t border-slate-100 even:bg-slate-50/50 dark:border-slate-800 dark:even:bg-slate-800/20",
                      promoGroupRowBgClass(item.promoGroupStripe ?? null),
                      flag === "red" && !item.promoGroupStripe && "bg-red-50/40 dark:bg-red-950/20",
                      flag !== "red" &&
                        (item.priceFlagged || item.discountFlagged) &&
                        !item.promoGroupStripe &&
                        "bg-amber-50/40 dark:bg-amber-950/20",
                      selectedRow && "!bg-teal-50 dark:!bg-teal-950/30",
                      zero && "opacity-60"
                    )}
                  >
                    <td className="px-2 py-2 align-top text-xs text-slate-400">
                      {onToggleSelect ? (
                        <Checkbox
                          checked={selectedRow}
                          onCheckedChange={() => onToggleSelect(item.id)}
                          aria-label={`เลือก ${item.sku.code}`}
                        />
                      ) : (
                        rowNum
                      )}
                    </td>
                    <td className="max-w-0 px-2 py-3 align-top">
                      <p
                        className={cn(
                          "min-w-0 truncate text-[15px] leading-snug font-semibold text-slate-900 dark:text-slate-50",
                          zero && "line-through"
                        )}
                        title={item.sku.name}
                      >
                        {item.sku.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                          {item.sku.code}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          · {formatNumber(item.packSize ?? 1, 0)} ชิ้น/หีบ
                        </span>
                        <FlagBadge flag={flag} />
                        {showPoGroups && item.poGroup && <PoGroupBadge groupKey={item.poGroup} />}
                        {item.priceFlagged && (
                          <PriceFlagBadge reason={item.priceFlagReason} title={priceFlagTitle(item)} compact />
                        )}
                        {item.discountFlagged && (
                          <DiscountFlagBadge
                            reason={item.discountFlagReason}
                            title={discountFlagTitle(item)}
                            compact
                          />
                        )}
                        {item.hasTarget === false && <NoTargetBadge compact />}
                        {item.qtyIncreasePendingConfirm && (
                          <PendingQtyIncreaseBadge
                            compact
                            newItem={item.requestedQty === 0 && !item.agreedQty}
                          />
                        )}
                        {item.rejectedAt && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            title={item.rejectReason || undefined}
                          >
                            <XCircle className="h-3 w-3" />
                            ปฏิเสธแล้ว{item.rejectReason ? ` · ${item.rejectReason}` : ""}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top">
                      {promoLoading ? (
                        <span className="text-xs text-slate-400">...</span>
                      ) : (
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
                      )}
                    </td>
                    <td className="px-2 py-2 align-top text-right">
                      {onQtyChange ? (
                        <QtyStepper
                          value={item.finalQty}
                          suggested={item.suggestedQty}
                          onChange={(v) => onQtyChange(item.id, v)}
                        />
                      ) : (
                        <p
                          className="text-base font-bold whitespace-nowrap tabular-nums text-slate-900 dark:text-slate-100"
                          title={`แนะนำ ${item.suggestedQty} · สั่ง ${item.finalQty}`}
                        >
                          {formatQtyPair(item.suggestedQty, item.finalQty)}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top text-right">
                      {promoLoading ? (
                        <span className="text-xs text-slate-400">...</span>
                      ) : (
                        <UnitPriceCell
                          item={item}
                          expired={api?.priceExpired}
                          editing={editingPriceId === item.id}
                          onEdit={(open) => setEditingPriceId(open ? item.id : null)}
                          onPriceChange={
                            onPriceChange ? (v) => onPriceChange(item.id, v) : undefined
                          }
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 align-top text-right">
                      <span className="text-lg font-bold whitespace-nowrap tabular-nums text-slate-900 dark:text-slate-50">
                        {promoLoading ? "..." : total != null ? formatBaht(total) : "-"}
                      </span>
                    </td>
                    {onRejectItem && (
                      <td className="px-1 py-2 align-top text-center">
                        {!item.rejectedAt && item.finalQty > 0 && (
                          <button
                            type="button"
                            onClick={() => setRejectPromptItem(item)}
                            className="rounded-md p-1 text-slate-300 hover:bg-red-50 hover:text-red-600 dark:text-slate-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                            title="ปฏิเสธรายการนี้"
                            aria-label={`ปฏิเสธ ${item.sku.code}`}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RejectItemModal
        open={rejectPromptItem != null}
        skuCode={rejectPromptItem?.sku.code ?? ""}
        skuName={rejectPromptItem?.sku.name ?? ""}
        onConfirm={(reason) => {
          if (rejectPromptItem && onRejectItem) {
            onRejectItem(rejectPromptItem.id, reason);
          }
          setRejectPromptItem(null);
        }}
        onClose={() => setRejectPromptItem(null)}
      />

      <AddOrderItemModal
        open={addItemOpen}
        pending={addItemPending}
        onSubmit={(skuCode, finalQty) => {
          onAddItem?.(skuCode, finalQty);
          setAddItemOpen(false);
        }}
        onClose={() => setAddItemOpen(false)}
      />
    </div>
  );
}

/**
 * แก้จำนวนก่อนอนุมัติ — ตั้ง 0 ได้ (ตัดบรรทัดออก) แต่ติดลบไม่ได้
 *
 * ยิงเมื่อค่าเปลี่ยนจริงเท่านั้น (blur/Enter) ไม่ยิงทุกตัวอักษรที่พิมพ์ เพราะ
 * ปลายทางเขียน DB + แจ้งเตือนร้านทุกครั้ง
 */
function QtyStepper({
  value,
  suggested,
  onChange,
}: {
  value: number;
  suggested: number;
  onChange: (qty: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // ค่าจากเซิร์ฟเวอร์เปลี่ยน (อีกคนแก้ / โหลดใหม่) → ตามค่าล่าสุดเสมอ
  useEffect(() => setDraft(String(value)), [value]);

  function commit(next: number) {
    const qty = Math.max(0, Math.trunc(Number.isFinite(next) ? next : value));
    setDraft(String(qty));
    if (qty !== value) onChange(qty);
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          className="px-1.5 py-0.5 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
          disabled={value <= 0}
          onClick={() => commit(value - 1)}
          aria-label="ลดจำนวน"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => commit(Number(draft))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={cn(
            "w-12 border-x border-slate-200 bg-transparent py-1 text-center text-base font-bold tabular-nums outline-none dark:border-slate-700",
            value === 0
              ? "text-red-600 dark:text-red-400"
              : "text-slate-900 dark:text-slate-100"
          )}
          title={`แนะนำ ${suggested} · สั่ง ${value}`}
        />
        <button
          type="button"
          className="px-1.5 py-0.5 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => commit(value + 1)}
          aria-label="เพิ่มจำนวน"
        >
          +
        </button>
      </div>
      {suggested > 0 && suggested !== value && (
        <span className="text-[10px] text-slate-400">แนะนำ {suggested}</span>
      )}
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
