"use client";

import { PromoInspectorTrigger } from "@/components/promo/c4-promo-modal";
import {
  isPooledPromoGroup,
  promoGroupBadgeClass,
  type PromoGroupStripe,
} from "@/lib/promo/promo-group-display";
import { cn } from "@/lib/utils";

export function sumGroupStagedQty(
  memberSkus: string[],
  stagedQty: Record<string, number>
): number {
  let total = 0;
  for (const code of memberSkus) {
    total += stagedQty[code] ?? 0;
  }
  return total;
}

export function buildGroupMemberSkusMap<
  T extends {
    promoGroup?: string | null;
    promoGroupMembers?: number | null;
    skuCode: string;
  },
>(rows: T[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const group = row.promoGroup?.trim();
    if (!group || !isPooledPromoGroup(group, row.promoGroupMembers)) continue;
    const list = map.get(group) ?? [];
    list.push(row.skuCode);
    map.set(group, list);
  }
  return map;
}

interface PromoGroupHeaderProps {
  promoGroup: string;
  stripe: PromoGroupStripe;
  hostSkuCode: string;
  memberSkus: string[];
  stagedQty: Record<string, number>;
  storeCode?: string;
  suggestByProduct?: Record<string, number>;
  onConfirmStaged?: (
    staged: Record<string, number>,
    memberSkus: string[]
  ) => void;
  readOnly?: boolean;
  /** เพิ่มหลังยืนยันจำนวนจาก modal — บังคับ remount modal รอบถัดไป */
  applyVersion?: number;
  /** false = แสดงเฉพาะ badge + ยอดรวม (หน้า order ตรวจสอบ) */
  showPromoButton?: boolean;
  className?: string;
}

export function PromoGroupHeader({
  promoGroup,
  stripe,
  storeCode,
  hostSkuCode,
  memberSkus,
  stagedQty,
  suggestByProduct,
  onConfirmStaged,
  readOnly = false,
  applyVersion = 0,
  showPromoButton = true,
  className,
}: PromoGroupHeaderProps) {
  const pooledQty = sumGroupStagedQty(memberSkus, stagedQty);
  const showButton = showPromoButton && pooledQty > 0 && Boolean(storeCode);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1",
          promoGroupBadgeClass(stripe)
        )}
      >
        กลุ่ม {promoGroup}
      </span>
      {pooledQty > 0 && (
        <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-400">
          รวม {pooledQty} หีบ
        </span>
      )}
      {showButton && storeCode && (
        <PromoInspectorTrigger
          skuCode={hostSkuCode}
          storeCode={storeCode}
          promoGroup={promoGroup}
          stagedQty={stagedQty}
          onConfirmStaged={
            readOnly || !onConfirmStaged
              ? undefined
              : (staged) => onConfirmStaged(staged, memberSkus)
          }
          suggestByProduct={suggestByProduct}
          readOnly={readOnly}
          applyVersion={applyVersion}
          stockMemberSkus={memberSkus}
          label="โปรกลุ่ม"
        />
      )}
    </div>
  );
}
