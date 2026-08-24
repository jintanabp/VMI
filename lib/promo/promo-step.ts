import { isBenefitTier, type PromoTierInput } from "@/lib/calculations";

/**
 * ขั้นโปรของแถม — ยอดสั่งต้องเป็นจำนวนเท่าของ "ล็อต" ถึงจะแถมลงตัว
 *
 * C4 เขียนโปรของแถมเป็น step tier (from == to) แล้วนับของแถมแบบ
 * `floor(ยอด / ล็อต) × ของแถมต่อล็อต` (calcStepPremiumQty ใน lib/calculations/promo.ts)
 * เศษที่ไม่ครบล็อตจึงเป็นของที่ร้านจ่ายเงินซื้อโดยไม่ได้อะไรเพิ่ม —
 * โปร "3 หีบแถม 1" สั่ง 5 หีบ ได้แถมเท่ากับสั่ง 3 หีบ ส่วนอีก 2 หีบเสียเปล่า
 *
 * ทุกจุดที่ตั้งจำนวนสั่งได้ (ช่องในตาราง, ปุ่ม +/−, ชิปแนะนำ, modal โปรกลุ่ม,
 * จำนวนแนะนำจากระบบ) จึงต้องผ่านที่นี่ก่อน กติกาอยู่ไฟล์เดียวจะได้ไม่เพี้ยนกันเอง
 */

/** ล็อตทั้งหมดของบันไดโปร เรียงน้อย→มาก — ล็อต 1 ไม่นับ (ทุกจำนวนลงตัวอยู่แล้ว) */
export function promoStepLots(tiers?: PromoTierInput[] | null): number[] {
  if (!tiers?.length) return [];
  const lots = new Set<number>();
  for (const t of tiers) {
    if (t.kind !== "premium" || !isBenefitTier(t)) continue;
    const lot = Math.floor(t.minQty);
    if (lot > 1) lots.add(lot);
  }
  return [...lots].sort((a, b) => a - b);
}

export function hasPromoStep(tiers?: PromoTierInput[] | null): boolean {
  return promoStepLots(tiers).length > 0;
}

/**
 * ล็อตที่คุมยอดนี้ — ขั้นที่ยอดถึงแล้ว (ยังไม่ถึงขั้นแรก = ขั้นแรก)
 *
 * บันไดที่มีหลายล็อต (เช่น 30 / 50 / 100) ขั้นสูงกว่า "แทนที่" ขั้นล่าง ไม่ใช่ทบกัน
 * ล็อตที่ต้องหารลงตัวจึงเป็นล็อตของขั้นที่ active อยู่เท่านั้น
 */
export function promoStepLot(
  tiers: PromoTierInput[] | null | undefined,
  qty: number
): number | null {
  const lots = promoStepLots(tiers);
  if (lots.length === 0) return null;
  let active = lots[0]!;
  for (const lot of lots) if (qty >= lot) active = lot;
  return active;
}

/** ค่าที่ลงตัวตัวแรกที่ ≥ q (q ต้องไม่ต่ำกว่าขั้นแรก) */
function stepUpFrom(lots: number[], q: number): number {
  let active = lots[0]!;
  let next: number | null = null;
  for (const lot of lots) {
    if (q >= lot) active = lot;
    else {
      next = lot;
      break;
    }
  }
  const up = Math.ceil(q / active) * active;
  // ขั้นถัดไปมาถึงก่อนทวีคูณของขั้นปัจจุบัน — 40 หีบในบันได 30/50 ไปที่ 50 ไม่ใช่ 60
  return next != null && next < up ? next : up;
}

/** ค่าที่ลงตัวตัวสุดท้ายที่ ≤ q (q ต้องไม่ต่ำกว่าขั้นแรก) */
function stepDownFrom(lots: number[], q: number): number {
  let active = lots[0]!;
  for (const lot of lots) if (q >= lot) active = lot;
  return Math.floor(q / active) * active;
}

/**
 * ปัดยอดไปขั้นที่ใกล้ที่สุด — ขึ้นหรือลงก็ได้ ขอแค่แถมไม่มีเศษ
 *
 * 0 = ไม่สั่ง ปล่อยผ่านเสมอ (ต้องมีทางเลิกสั่งได้)
 * ต่ำกว่าขั้นแรกดันขึ้นขั้นแรกเสมอ — สั่ง 2 หีบในโปร "3 แถม 1" คือจ่ายเต็มไม่ได้แถม
 * ส่วนที่เลยขั้นแรกมาแล้วปัดไปทางที่ใกล้กว่า: ล็อต 24 ยอด 26 ควรลงที่ 24 (−2)
 * ไม่ใช่ 48 (+22) ซึ่งเปลี่ยนขนาดออเดอร์เกือบเท่าตัวเพื่อของแถมล็อตเดียว
 * ห่างเท่ากันให้ปัดขึ้น — ของขาดแพงกว่าของเกินนิดหน่อย
 */
export function snapQtyToPromoStep(
  tiers: PromoTierInput[] | null | undefined,
  qty: number
): number {
  const q = Math.max(0, Math.floor(qty));
  if (q <= 0) return 0;
  const lots = promoStepLots(tiers);
  if (lots.length === 0) return q;
  if (q < lots[0]!) return lots[0]!;

  const up = stepUpFrom(lots, q);
  const down = stepDownFrom(lots, q);
  return q - down < up - q ? down : up;
}

export function isOnPromoStep(
  tiers: PromoTierInput[] | null | undefined,
  qty: number
): boolean {
  return snapQtyToPromoStep(tiers, qty) === Math.max(0, Math.floor(qty));
}

/** ขั้นถัดขึ้นไป — ใช้กับปุ่ม + (ต้องมากกว่าเดิมเสมอ ห้ามใช้ snap ซึ่งปัดลงได้) */
export function nextPromoStepQty(
  tiers: PromoTierInput[] | null | undefined,
  qty: number
): number {
  const q = Math.max(0, Math.floor(qty));
  const lots = promoStepLots(tiers);
  if (lots.length === 0) return q + 1;
  if (q < lots[0]!) return lots[0]!;
  return stepUpFrom(lots, q + 1);
}

/** ขั้นถัดลงมา — ใช้กับปุ่ม − (ต่ำกว่าขั้นแรก = 0 เพราะสั่งไม่ครบขั้นก็ไม่ได้แถม) */
export function prevPromoStepQty(
  tiers: PromoTierInput[] | null | undefined,
  qty: number
): number {
  const q = Math.max(0, Math.floor(qty));
  if (q <= 0) return 0;
  const lots = promoStepLots(tiers);
  if (lots.length === 0) return q - 1;
  if (q <= lots[0]!) return 0;
  const down = stepDownFrom(lots, q - 1);
  return down >= lots[0]! ? down : 0;
}

/** ข้อความบอกเหตุผลที่จำนวนถูกปรับ — null เมื่อไม่ได้ปรับ */
export function promoStepNote(
  tiers: PromoTierInput[] | null | undefined,
  requested: number,
  applied: number
): string | null {
  if (applied === requested) return null;
  const lot = promoStepLot(tiers, applied);
  if (lot == null) return null;
  return `โปรแถมขั้นละ ${lot} หีบ — ปรับ ${requested} เป็น ${applied}`;
}

/* ────────────────────────── โปรกลุ่ม (รวมยอดข้าม SKU) ──────────────────────────
   เงื่อนไขอยู่ที่ "ยอดรวมกลุ่ม" ไม่ใช่รายบรรทัด — บังคับทีละบรรทัดจะได้กลุ่มละ
   หลายเท่าของล็อต (สมาชิก 5 ตัว × ล็อต 24 = 120 หีบ) ซึ่งไม่ใช่เงื่อนไขของโปรเลย
   ------------------------------------------------------------------------------ */

export interface PromoStepGroupMember {
  skuCode: string;
  qty: number;
  /** จำนวนที่ระบบแนะนำ — ใช้เลือกว่าจะเติมส่วนที่ขาดให้ SKU ไหน */
  suggestOrder?: number;
}

export interface PromoGroupStepFix {
  lot: number;
  pool: number;
  target: number;
  /** ส่วนที่ต้องปรับให้ยอดรวมลงตัว — ติดลบ = ต้องลดลง */
  delta: number;
  /** SKU ที่รับการปรับนั้นไว้ */
  topUpSku: string;
}

/**
 * แผนปรับยอดรวมกลุ่มให้ลงล็อต — เติมส่วนที่ขาดที่ SKU ที่ควรสั่งมากที่สุด
 *
 * `excludeSku` = บรรทัดที่ผู้ใช้เพิ่งพิมพ์ ห้ามเอาไปทับ ไม่งั้นเลขที่เพิ่งใส่จะเด้ง
 * กลับทันทีและแก้ไม่ได้เลย — ถ้าไม่มีสมาชิกตัวอื่นค่อยเติมที่บรรทัดนั้นเอง
 *
 * ยอดรวม 0 = ไม่สั่งทั้งกลุ่ม ปล่อยผ่าน (ต้องมีทางเลิกสั่งกลุ่มเสมอ)
 */
export function planPromoGroupStepFix(
  tiers: PromoTierInput[] | null | undefined,
  members: PromoStepGroupMember[],
  opts?: { excludeSku?: string }
): PromoGroupStepFix | null {
  if (members.length === 0) return null;
  if (promoStepLots(tiers).length === 0) return null;

  const pool = members.reduce(
    (sum, m) => sum + Math.max(0, Math.floor(m.qty)),
    0
  );
  if (pool <= 0) return null;

  const target = snapQtyToPromoStep(tiers, pool);
  if (target === pool) return null;

  // อยู่ในคำสั่งแล้วมาก่อน — เติมให้ SKU ที่ยังไม่ได้สั่งเท่ากับแอบเพิ่มสินค้าใหม่
  // เข้าใบสั่ง ในบรรดาที่สั่งอยู่แล้วค่อยเลือกตัวที่ระบบแนะนำมากสุด
  const byPriority = [...members].sort(
    (a, b) =>
      (a.qty > 0 ? 0 : 1) - (b.qty > 0 ? 0 : 1) ||
      (b.suggestOrder ?? 0) - (a.suggestOrder ?? 0) ||
      b.qty - a.qty ||
      a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true })
  );

  /**
   * ปรับที่บรรทัดเดียว จึงต้องหาบรรทัดที่ "รับไหว" จริง
   *
   * ตอนปัดลง ส่วนที่ต้องลดอาจมากกว่าจำนวนของบรรทัดที่เลือกไว้ (A=1, B=25 ลด 2)
   * ลดไปตรง ๆ จะได้จำนวนติดลบ — ถ้าไม่มีใครรับไหวเลยก็ถอยไปปัดขึ้นแทน
   * ซึ่งบวกกับบรรทัดไหนก็ได้เสมอ
   */
  function pick(need: number) {
    const fits = (m: PromoStepGroupMember) =>
      need >= 0 || Math.max(0, Math.floor(m.qty)) >= -need;
    return (
      byPriority.find((m) => m.skuCode !== opts?.excludeSku && fits(m)) ??
      byPriority.find((m) => fits(m)) ??
      null
    );
  }

  let finalTarget = target;
  let host = pick(target - pool);
  if (!host) {
    finalTarget = stepUpFrom(promoStepLots(tiers), pool);
    host = byPriority.find((m) => m.skuCode !== opts?.excludeSku) ?? byPriority[0]!;
  }

  return {
    lot: promoStepLot(tiers, finalTarget)!,
    pool,
    target: finalTarget,
    delta: finalTarget - pool,
    topUpSku: host.skuCode,
  };
}

/** ข้อความอธิบายการปรับยอดกลุ่ม — ใช้ทั้ง toast และคำเตือนหน้าตรวจสอบ */
export function promoGroupStepNote(
  fix: PromoGroupStepFix,
  groupLabel: string
): string {
  const head = `${groupLabel}: รวม ${fix.pool} หีบไม่ลงขั้นโปร (ขั้นละ ${fix.lot} หีบ)`;
  return fix.delta > 0
    ? `${head} — เพิ่มอีก ${fix.delta} หีบที่ ${fix.topUpSku} รวมเป็น ${fix.target} หีบ`
    : `${head} — ส่วนเกิน ${-fix.delta} หีบไม่ได้ของแถม ลดที่ ${fix.topUpSku} เหลือรวม ${fix.target} หีบ`;
}

/**
 * ป้ายสั้นบนหัวกลุ่ม — ต้องบอก "ยอดที่สั่งจริง" ด้วยเสมอ
 *
 * เลข "รวม N หีบ" ที่อยู่ข้าง ๆ บนหัวกลุ่มเป็นยอดจำลอง (บรรทัดที่ยังไม่แตะนับ
 * จำนวนแนะนำไปด้วย) แต่ป้ายนี้เป็นปุ่มที่ไปแก้ "จำนวนที่จะสั่งจริง" สองเลขนี้
 * ต่างกันได้ ถ้าไม่บอกฐานไว้จะอ่านแล้วขัดกันเอง
 */
export function promoGroupStepChipLabel(short: {
  pool: number;
  delta: number;
  target: number;
}): string {
  const tail =
    short.delta > 0
      ? `อีก ${short.delta} หีบครบขั้นโปร (${short.target})`
      : `เกินขั้นโปร ${-short.delta} หีบ (ลงตัวที่ ${short.target})`;
  return `ยอดสั่งกลุ่ม ${short.pool} หีบ · ${tail}`;
}

/** คำอธิบายเต็มของป้ายข้างบน — ใช้เป็น tooltip */
export function promoGroupStepChipTitle(
  short: { lot: number; pool: number; delta: number; target: number },
  actionable: boolean
): string {
  const head = `ของแถมนับเป็นล็อตละ ${short.lot} หีบ — ยอดที่จะสั่งจริงของกลุ่มนี้คือ ${short.pool} หีบ ต้องเป็น ${short.target} หีบถึงจะได้ของแถมเต็มจำนวนโดยไม่มีเศษ`;
  return actionable
    ? `${head} (กดเพื่อปรับให้อัตโนมัติ ระบบจะปรับที่ SKU ที่ควรสั่งมากสุด)`
    : head;
}

/* ────────────────────── จำนวนแนะนำของระบบ (suggestOrder) ────────────────────── */

export interface PromoStepSuggestRow {
  skuCode: string;
  suggestOrder: number;
  promoTiers?: PromoTierInput[] | null;
  promoGroup?: string | null;
  promoGroupMembers?: number | null;
}

/**
 * ปัดจำนวนแนะนำทั้งชุดให้ลงล็อตโปร — คืนเฉพาะ SKU ที่เปลี่ยน
 *
 * แถวที่ระบบไม่ได้แนะนำ (0) ไม่แตะ — "ไม่ต้องสั่ง" ต้องแปลว่าไม่ต้องสั่งจริง ๆ
 * ไม่ใช่ถูกดันขึ้นขั้นแรกเพราะบังเอิญมีโปรติดอยู่
 */
export function snapSuggestOrdersToPromoStep(
  rows: PromoStepSuggestRow[]
): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, PromoStepSuggestRow[]>();

  for (const row of rows) {
    const group = row.promoGroup?.trim();
    const pooled = Boolean(group) && (row.promoGroupMembers ?? 0) > 1;
    if (pooled) {
      const list = groups.get(group!) ?? [];
      list.push(row);
      groups.set(group!, list);
      continue;
    }
    if (row.suggestOrder <= 0) continue;
    const snapped = snapQtyToPromoStep(row.promoTiers, row.suggestOrder);
    if (snapped !== row.suggestOrder) out.set(row.skuCode, snapped);
  }

  for (const members of groups.values()) {
    const tiers = members.find(
      (m) => promoStepLots(m.promoTiers).length > 0
    )?.promoTiers;
    const fix = planPromoGroupStepFix(
      tiers,
      members.map((m) => ({
        skuCode: m.skuCode,
        qty: Math.max(0, m.suggestOrder),
        suggestOrder: m.suggestOrder,
      }))
    );
    if (!fix) continue;
    const host = members.find((m) => m.skuCode === fix.topUpSku);
    if (!host) continue;
    out.set(
      host.skuCode,
      Math.max(0, Math.max(0, host.suggestOrder) + fix.delta)
    );
  }

  return out;
}
