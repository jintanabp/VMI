"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  formatPromoTierLabelVerbose,
  isBenefitTier,
  type PromoTierInput,
  type PromoTierKind,
} from "@/lib/calculations";
import { C4PromoModal } from "@/components/promo/c4-promo-modal";
import {
  isPooledPromoGroup,
  promoGroupDotClass,
  promoGroupStripeFor,
} from "@/lib/promo/promo-group-display";
import { usePromoGroupNames } from "@/hooks/use-promo-group-names";
import { cn } from "@/lib/utils";

export interface PromoFreeGoodDetail {
  premiumProduct: string;
  premiumName: string;
  qty: number;
  unitLabel: string;
  tierFromQty: number;
  tierPremiumQty: number;
  pooledQty?: number;
  lineQty?: number;
}

interface PromoDetailCellProps {
  currentPromo?: string | null;
  currentKind?: PromoTierKind | null;
  nextPromo?: string | null;
  qtyToNext?: number | null;
  nextPromoQty?: number | null;
  nextKind?: PromoTierKind | null;
  freeGood?: PromoFreeGoodDetail | null;
  /** false = ใช้ freeGood ซ่อนชิปแถมซ้ำ แต่ไม่เรนเดอร์ชิป (มีแถวย่อยแทน) — default true */
  showFreeGoodChip?: boolean;
  hasPromoLadder?: boolean;
  /** ขั้นบันไดโปรทั้งหมด — ใช้บอกเงื่อนไขขั้นแรกเมื่อยังไม่ได้สั่ง (จำนวน = 0)
   *  ไม่งั้นสินค้าที่ไม่ได้แนะนำสั่งจะไม่เห็นเลยว่ามีโปรอะไร */
  tiers?: PromoTierInput[];
  /** จำนวนวันที่โปรปัจจุบันจะหมด — โชว์ป้ายเตือนเมื่อ ≤ 7 วัน */
  endsInDays?: number | null;
  onApplyNext?: (qty: number) => void;
  variant?: "table" | "card" | "embedded" | "compact";
  /** สินค้าที่ระบบไม่ได้แนะนำให้สั่ง — ยังบอกโปรครบ แต่ลดความเด่นลงไม่ให้แย่งสายตา */
  muted?: boolean;
  /** แสดงป้ายกลุ่มโปรนำหน้า (สีคงที่ต่อกลุ่ม) — ให้รู้ว่าสินค้าตัวไหนรวมยอดโปรกันได้
   *  ส่งค่าเมื่อไม่ได้เรียงแบบกลุ่มโปร ซึ่งไม่มีแถวหัวกลุ่ม/แถบสีบอกอยู่แล้ว */
  showGroupChip?: boolean;
  inspector?: {
    skuCode: string;
    storeCode: string;
    stagedQty?: Record<string, number>;
    promoGroup?: string | null;
    promoGroupMembers?: number;
    onConfirmStaged?: (
      staged: Record<string, number>,
      memberSkus?: string[]
    ) => void;
    /** map รหัสสินค้า -> จำนวนแนะนำสั่ง เพื่อ mark "แนะนำซื้อ" ใน modal กลุ่ม */
    suggestByProduct?: Record<string, number>;
    /** SKU ในกลุ่มที่ร้านนี้มีของ — ให้ modal กลุ่มแสดงตรงกับตารางหลัก */
    stockMemberSkus?: string[];
    readOnly?: boolean;
  };
}

export type PromoInspectorProps = NonNullable<
  PromoDetailCellProps["inspector"]
>;

/**
 * แปลงแถวสต็อกเป็น props ของตัวเปิดดูขั้นบันไดโปร
 *
 * มี tier ไม่พอ — C4 มี record ที่ kind = "none" / ส่วนลด 0 ซึ่งกดเข้าไปก็ไม่มีอะไร
 * รวมถึง "กลุ่มโปร" ที่จับสินค้าไว้ด้วยกันแต่ไม่ให้สิทธิประโยชน์ใด ๆ (ladder = 1 ขั้น ลด 0)
 * ต้องมีส่วนลด/ของแถมจริงเท่านั้นถึงจะบอกว่ามีโปร — ไม่งั้นเป็นการหลอกให้กดเปล่า ๆ
 */
export function buildPromoInspectorProps(
  row: {
    skuCode: string;
    promoGroup?: string | null;
    promoGroupMembers?: number;
    promoTiers?: PromoTierInput[];
  },
  ctx: {
    storeCode: string;
    stagedQty: Record<string, number>;
    memberSkus?: string[];
    onConfirmStaged: (
      staged: Record<string, number>,
      memberSkus?: string[]
    ) => void;
    suggestByProduct: Record<string, number>;
  }
): PromoInspectorProps | undefined {
  if (!(row.promoTiers ?? []).some(isBenefitTier)) return undefined;
  return {
    skuCode: row.skuCode,
    storeCode: ctx.storeCode,
    stagedQty: ctx.stagedQty,
    promoGroup: row.promoGroup,
    promoGroupMembers: row.promoGroupMembers,
    stockMemberSkus: ctx.memberSkus,
    onConfirmStaged: ctx.onConfirmStaged,
    suggestByProduct: ctx.suggestByProduct,
  };
}

export function PromoDetailCell({
  currentPromo,
  currentKind,
  nextPromo,
  qtyToNext,
  nextPromoQty,
  freeGood,
  showFreeGoodChip = true,
  hasPromoLadder,
  tiers,
  endsInDays,
  onApplyNext,
  variant = "table",
  muted = false,
  showGroupChip = false,
  inspector,
}: PromoDetailCellProps) {
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const { label: groupLabel, shortLabel: groupShortLabel } =
    usePromoGroupNames();

  const showFreeGood = Boolean(freeGood && freeGood.qty > 0);
  const renderFreeGoodChip = showFreeGood && showFreeGoodChip;
  const hasCurrent = Boolean(currentPromo);
  const hasNext =
    Boolean(nextPromo) &&
    nextPromoQty != null &&
    (qtyToNext ?? 0) > 0;

  const hideCurrentForFreeGood =
    showFreeGood &&
    (currentKind === "premium" ||
      (currentPromo?.startsWith("แถม") ?? false) ||
      (currentPromo?.includes("ได้แถม") ?? false));

  const showCurrentPromo = hasCurrent && !hideCurrentForFreeGood;

  // ได้โปรสูงสุดแล้ว: มีโปรปัจจุบัน + มีบันได แต่ไม่มีขั้นถัดไป
  const atMaxPromo =
    hasPromoLadder === true &&
    (hasCurrent || showFreeGood) &&
    !hasNext &&
    qtyToNext == null;

  const isPooled = isPooledPromoGroup(
    inspector?.promoGroup,
    inspector?.promoGroupMembers
  );
  // เปิดดูขั้นบันไดได้ทุกแถวที่มีโปร รวมถึงสินค้าในกลุ่มโปร
  // (เดิมกลุ่มโปรกดได้เฉพาะตอนเรียงแบบ "กลุ่มโปรโมชั่น" ซึ่งมีแถวหัวกลุ่มให้กด)
  const canOpenInspector = Boolean(inspector);

  const openInspector = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSkuModalOpen(true);
  };

  /** ขั้นแรกของบันไดโปร — เงื่อนไขที่ต้องทำให้ได้ก่อนถึงจะได้ประโยชน์
   *  ใช้แสดงกับสินค้าที่ยังไม่ได้สั่ง (จำนวน 0) ซึ่งไม่มีทั้งโปรปัจจุบันและขั้นถัดไป */
  const entryTier = useMemo(() => {
    const benefit = (tiers ?? []).filter(isBenefitTier);
    if (benefit.length === 0) return null;
    let best = benefit[0]!;
    for (const t of benefit) if (t.minQty < best.minQty) best = t;
    return { tier: best, steps: benefit.length };
  }, [tiers]);

  /** รหัสกลุ่มโปร — แสดงเป็นจุดสีคงที่ต่อกลุ่มในบรรทัดบริบท ให้กวาดตาเห็นว่าตัวไหนรวมยอดกันได้ */
  const groupCode = inspector?.promoGroup?.trim();

  /* ────────────────────────────────────────────────────────────────
     เลย์เอาต์ 3 ระดับ — เดิมเป็นชิปสีเต็มใบ 4 อันวางเรียงกันน้ำหนักเท่ากัน
     ในคอลัมน์แคบ ทำให้อ่านไม่ออกว่าอะไรสำคัญ ตอนนี้แยกเป็น

       1. บรรทัดหลัก  — "ได้อะไรตอนนี้" ตัวหนา มีสีตามชนิดโปร ไม่มีพื้นหลัง
       2. บรรทัดบริบท — กลุ่มโปร · ใกล้หมด · ขั้นสูงสุด ตัวเล็กสีจาง คั่นด้วย ·
       3. บรรทัดถัดไป — "อีกกี่หีบได้อะไรเพิ่ม" กดแล้วใส่จำนวนให้เลย

     เหลือพื้นหลังสีเฉพาะบรรทัดที่ 3 ซึ่งเป็นปุ่มกดจริง ๆ ที่เหลือเป็นข้อความ
     ──────────────────────────────────────────────────────────────── */
  const sizeMain = variant === "compact" ? "vmi-t-sm" : "text-xs";
  const sizeMeta = "vmi-t-xs";

  const benefitColor = muted
    ? "text-slate-500 dark:text-slate-400"
    : currentKind === "premium"
      ? "text-violet-700 dark:text-violet-300"
      : currentKind === "discount_baht" || currentKind === "discount_pct"
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-slate-700 dark:text-slate-200";

  /** บรรทัดหลัก — สิ่งที่ร้านได้รับ (อาจมีทั้งส่วนลดและของแถมพร้อมกัน) */
  const primaryLines: { key: string; text: string; className: string }[] = [];
  if (showCurrentPromo) {
    primaryLines.push({
      key: "current",
      text: currentPromo!,
      className: cn("font-semibold", benefitColor),
    });
  }
  if (renderFreeGoodChip && freeGood) {
    primaryLines.push({
      key: "free",
      text: `แถม ${freeGood.premiumName} ×${freeGood.qty}`,
      className: cn(
        "font-semibold",
        muted
          ? "text-slate-500 dark:text-slate-400"
          : "text-violet-700 dark:text-violet-300"
      ),
    });
  }
  // ยังไม่ได้สั่งจนได้โปร — บอกเงื่อนไขขั้นแรกไว้แบบจาง ๆ
  // ข้ามเมื่อมีบรรทัด "อีกกี่หีบ" อยู่แล้ว เพราะสองอันนี้บอกเรื่องเดียวกัน
  if (primaryLines.length === 0 && !hasNext && entryTier) {
    primaryLines.push({
      key: "entry",
      text: formatPromoTierLabelVerbose(entryTier.tier),
      className: "font-normal text-slate-500 dark:text-slate-400",
    });
  }

  /** บรรทัดบริบท — ข้อมูลประกอบที่ไม่ควรแย่งสายตาบรรทัดหลัก */
  const metaItems: { key: string; node: ReactNode }[] = [];
  if (showGroupChip && isPooled && groupCode) {
    metaItems.push({
      key: "group",
      node: (
        // คอลัมน์โปรกว้าง ~220px — ใช้ชื่อแบบสั้น (ตัดวงเล็บไล่รสออก) แล้วยอมให้ตกบรรทัดได้ 2 บรรทัด
        // ชื่อเต็มอยู่ใน tooltip และแถวหัวกลุ่ม ที่นี่ต้องการแค่ "ตัวไหนรวมยอดกับตัวไหนได้"
        <span
          className="inline-flex min-w-0 items-start gap-1 font-medium text-slate-600 dark:text-slate-300"
          title={`อยู่ในกลุ่มโปร ${groupLabel(groupCode)} (รหัส ${groupCode}) — ยอดสั่งของสินค้าในกลุ่มนี้รวมกันเพื่อไต่ขั้นโปรได้`}
        >
          <span
            className={cn(
              "mt-[0.3em] h-1.5 w-1.5 shrink-0 rounded-full",
              promoGroupDotClass(promoGroupStripeFor(groupCode))
            )}
          />
          <span className="line-clamp-2 break-words">
            {groupShortLabel(groupCode)}
          </span>
        </span>
      ),
    });
  }
  if (
    (showCurrentPromo || showFreeGood) &&
    endsInDays != null &&
    endsInDays <= 7
  ) {
    metaItems.push({
      key: "ends",
      node: (
        <span
          className="font-semibold text-orange-600 dark:text-orange-400"
          title="โปรใกล้หมด — สั่งก่อนหมดเขต"
        >
          {endsInDays <= 0 ? "หมดวันนี้" : `หมดใน ${endsInDays} วัน`}
        </span>
      ),
    });
  }
  if (atMaxPromo) {
    metaItems.push({
      key: "max",
      node: (
        <span title="สินค้านี้ได้ส่วนลด/ของแถมขั้นสูงสุดแล้ว">ขั้นสูงสุด</span>
      ),
    });
  }
  if (!showCurrentPromo && entryTier && entryTier.steps > 1) {
    metaItems.push({
      key: "steps",
      node: (
        <span title="กดเพื่อดูขั้นบันไดทั้งหมด">{entryTier.steps} ขั้น</span>
      ),
    });
  }

  const skuModal =
    skuModalOpen && inspector ? (
      <C4PromoModal
        skuCode={inspector.skuCode}
        storeCode={inspector.storeCode}
        promoGroup={isPooled ? (inspector.promoGroup ?? undefined) : undefined}
        stockMemberSkus={isPooled ? inspector.stockMemberSkus : undefined}
        stagedQty={inspector.stagedQty ?? {}}
        onConfirm={
          inspector.readOnly
            ? undefined
            : inspector.onConfirmStaged
              ? (staged) =>
                  inspector.onConfirmStaged!(
                    staged,
                    isPooled ? inspector.stockMemberSkus : undefined
                  )
              : undefined
        }
        suggestByProduct={inspector.suggestByProduct}
        readOnly={inspector.readOnly}
        onClose={() => setSkuModalOpen(false)}
      />
    ) : null;

  // ไม่มีอะไรจะบอกเลย
  if (primaryLines.length === 0 && metaItems.length === 0 && !hasNext) {
    return (
      <>
        <span className={cn(sizeMain, "text-slate-400")}>
          {hasPromoLadder && variant !== "compact" ? "ไม่มีส่วนลด" : "—"}
        </span>
        {skuModal}
      </>
    );
  }

  const primaryBlock =
    primaryLines.length > 0 ? (
      <div className={cn("flex min-w-0 flex-col", sizeMain, "leading-snug")}>
        {primaryLines.map((line) => (
          <span
            key={line.key}
            /* ยอมตก 2 บรรทัดแทน truncate — พอของแถมบอกชื่อสินค้าเต็ม ข้อความยาวกว่า
               คอลัมน์เสมอ (เช่น "ซื้อครบ 24 หีบ/ขั้น แถม บิสชินบัตเตอร์โคโคนัต…")
               แล้วส่วนที่บอกว่าได้อะไรโดนตัดหายไปหมด ซึ่งเป็นใจความสำคัญของช่องนี้
               ความสูงแถวไม่เพิ่ม เพราะคอลัมน์ชื่อสินค้าเป็น line-clamp-2 อยู่แล้ว
               vmi-cell-text = overflow-wrap:anywhere จำเป็นเพราะภาษาไทยไม่มีเว้นวรรค */
            className={cn("vmi-cell-text line-clamp-2", line.className)}
          >
            {line.text}
          </span>
        ))}
      </div>
    ) : null;

  const content = (
    <div className="flex min-w-0 flex-col gap-0.5">
      {/* บรรทัดหลักกดได้ทั้งแถบ — เปิดขั้นบันไดโปรทั้งหมด */}
      {primaryBlock &&
        (canOpenInspector ? (
          <button
            type="button"
            onClick={openInspector}
            title={`${primaryLines.map((l) => l.text).join(" · ")} — กดดูขั้นบันไดโปรทั้งหมด`}
            className="min-w-0 rounded text-left transition-opacity hover:opacity-70"
          >
            {primaryBlock}
          </button>
        ) : (
          <div title={primaryLines.map((l) => l.text).join(" · ")}>
            {primaryBlock}
          </div>
        ))}

      {metaItems.length > 0 && (
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-x-1 leading-tight text-slate-400 dark:text-slate-500",
            sizeMeta
          )}
        >
          {metaItems.map((item, i) => (
            <Fragment key={item.key}>
              {i > 0 && <span aria-hidden>·</span>}
              {item.node}
            </Fragment>
          ))}
        </div>
      )}

      {hasNext && (
        <NextPromoHint
          qtyToNext={qtyToNext!}
          nextPromo={nextPromo!}
          nextPromoQty={nextPromoQty!}
          onApplyNext={onApplyNext}
          textSize={sizeMeta}
        />
      )}

      {canOpenInspector && !primaryBlock && (
        <button
          type="button"
          title="กดดูรายละเอียดโปร"
          onClick={openInspector}
          className={cn(
            "self-start font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400",
            sizeMeta
          )}
        >
          ดูขั้นบันไดโปร
        </button>
      )}
    </div>
  );

  if (variant === "card") {
    return (
      <>
        <div className="flex items-start gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 p-2.5 dark:border-slate-700/60 dark:bg-slate-800/40">
          <div className="min-w-0 flex-1">{content}</div>
        </div>
        {skuModal}
      </>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 items-start",
          variant === "table" && "max-w-[220px]",
          variant === "compact" && "max-w-full"
        )}
      >
        <div className="min-w-0 flex-1 overflow-hidden">{content}</div>
      </div>
      {skuModal}
    </>
  );
}

function NextPromoHint({
  qtyToNext,
  nextPromo,
  nextPromoQty,
  onApplyNext,
  textSize,
}: {
  qtyToNext: number;
  nextPromo: string;
  nextPromoQty: number;
  onApplyNext?: (qty: number) => void;
  textSize: string;
}) {
  // เน้น "อีกกี่หีบ" ให้เด่นกว่าส่วนที่เหลือ เพราะเป็นตัวเลขที่ต้องตัดสินใจ
  const label = `อีก ${qtyToNext} หีบ ${nextPromo}`;
  const chip = cn(
    "inline-flex max-w-full items-center gap-1 self-start rounded-md px-1.5 py-0.5",
    textSize
  );
  const inner = (
    <>
      <span className="shrink-0 font-bold">อีก {qtyToNext} หีบ</span>
      <span className="truncate opacity-90">{nextPromo}</span>
    </>
  );

  if (onApplyNext) {
    return (
      <button
        type="button"
        onClick={() => onApplyNext(nextPromoQty)}
        className={cn(
          chip,
          "bg-sky-50 text-sky-800 ring-1 ring-sky-200 transition-colors hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/25 dark:hover:bg-sky-500/20"
        )}
        title={`${label} — กดเพื่อปรับจำนวนสั่งเป็น ${nextPromoQty} หีบ`}
      >
        {inner}
      </button>
    );
  }

  return (
    <span
      className={cn(
        chip,
        "bg-sky-50 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/25"
      )}
      title={`มีโปรถัดไป — ยืนยันสั่งตามจำนวนนี้จะได้โปรปัจจุบัน · ${label}`}
    >
      {inner}
    </span>
  );
}
