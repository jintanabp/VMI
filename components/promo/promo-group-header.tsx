"use client";

import { PromoInspectorTrigger } from "@/components/promo/c4-promo-modal";
import {
  isPooledPromoGroup,
  promoGroupBadgeClass,
  type PromoGroupStripe,
} from "@/lib/promo/promo-group-display";
import { buildPromoTitle } from "@/lib/promo/promo-title";
import {
  promoGroupStepChipLabel,
  promoGroupStepChipTitle,
} from "@/lib/promo/promo-step";
import { usePromoGroupNames } from "@/hooks/use-promo-group-names";
import type { PromoTierInput } from "@/lib/calculations";
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
  /**
   * ขั้นบันไดของกลุ่ม — ถ้าส่งมาจะโชว์ชื่อโปรที่อ่านรู้เรื่องแทนรหัสกลุ่มเปล่า ๆ
   * (C4 ไม่มีคอลัมน์ชื่อโปร ต้องสังเคราะห์จากเงื่อนไข)
   */
  tiers?: PromoTierInput[];
  /** จำนวนวันที่โปรจะหมด — ใช้ประกอบชื่อ */
  endsInDays?: number | null;
  /**
   * ยอดรวมกลุ่มยังไม่ลงล็อตโปรของแถม — ส่วนที่ขาดกับเป้าที่ต้องไปให้ถึง
   *
   * คำนวณจากหน้าแม่ ไม่ใช่จาก stagedQty ที่นี่ เพราะต้องอิง "จำนวนที่สั่งจริง"
   * ชุดเดียวกับตอนกดตรวจสอบคำสั่ง ไม่งั้นหัวกลุ่มบอกว่าลงตัวแล้วแต่ระบบยังปรับให้อีก
   */
  stepShort?: {
    lot: number;
    pool: number;
    delta: number;
    target: number;
  } | null;
  onApplyStepFix?: () => void;
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
  tiers,
  endsInDays,
  stepShort = null,
  onApplyStepFix,
  className,
}: PromoGroupHeaderProps) {
  const { names, tooltip } = usePromoGroupNames();
  const pooledQty = sumGroupStagedQty(memberSkus, stagedQty);
  const showButton = showPromoButton && pooledQty > 0 && Boolean(storeCode);
  const title =
    tiers && tiers.length > 0
      ? buildPromoTitle({
          group: promoGroup,
          groupName: names[promoGroup.trim()],
          tiers,
          memberCount: memberSkus.length,
          endsInDays,
        })
      : null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className
      )}
    >
      {title ? (
        // แถวหัวกลุ่มกินความกว้างทั้งตาราง — ให้ตัดบรรทัดแทนตัดคำด้วย "..."
        // ชื่อกลุ่มจาก C4 ยาวได้ถึง ~80 ตัวอักษร (ไล่รสในวงเล็บ) ถ้า truncate จะเหลือแค่คำแรก
        <span
          className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
          title={tooltip(promoGroup)}
        >
          <span
            className={cn(
              "inline-block h-2 w-2 shrink-0 self-center rounded-full ring-1",
              promoGroupBadgeClass(stripe)
            )}
            aria-hidden
          />
          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
            {title.headline}
          </span>
          <span className="min-w-0 break-words text-[10px] text-slate-500 dark:text-slate-400">
            {title.meta}
          </span>
        </span>
      ) : (
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1 break-words rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1",
            promoGroupBadgeClass(stripe)
          )}
          title={tooltip(promoGroup)}
        >
          {names[promoGroup.trim()] ?? `กลุ่ม ${promoGroup}`}
        </span>
      )}
      {pooledQty > 0 && (
        <span className="text-[10px] font-medium tabular-nums text-slate-600 dark:text-slate-400">
          รวม {pooledQty} หีบ
        </span>
      )}
      {stepShort && (
        // ของแถมนับเป็นล็อต — ยอดรวมที่ไม่ลงล็อตคือจ่ายเต็มโดยไม่ได้ของแถมส่วนที่เกิน
        // กดได้เมื่อหน้าแม่ส่งวิธีปรับมาให้ (หน้า order ตรวจสอบเป็นแบบดูอย่างเดียว)
        <button
          type="button"
          disabled={!onApplyStepFix}
          onClick={(e) => {
            e.stopPropagation();
            onApplyStepFix?.();
          }}
          title={promoGroupStepChipTitle(stepShort, Boolean(onApplyStepFix))}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/40",
            onApplyStepFix &&
              "transition-colors hover:bg-amber-200 dark:hover:bg-amber-500/30"
          )}
        >
          {promoGroupStepChipLabel(stepShort)}
          {onApplyStepFix && <span className="font-semibold">· ปรับให้</span>}
        </button>
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
