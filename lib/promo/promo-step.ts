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

/* ─────────────── ปัดเข้าขั้นโปรตามสัดส่วน (ใช้ที่หน้าตรวจโปรก่อนสั่ง) ───────────────
   snapQtyToPromoStep ข้างบนปัดไป "ขั้นที่ใกล้ที่สุด" และดันขึ้นเสมอเมื่อยังไม่ถึงขั้นแรก
   — แนะนำ 1 หีบในโปร "12 แถม 1" จึงกลายเป็นสั่ง 12 หีบทั้งที่ร้านไม่ได้ตั้งใจ และ
   บังคับตั้งแต่ตอนพิมพ์ ทำให้จำนวนเดิมหายไปก่อนที่ร้านจะได้เห็นว่ามันถูกเปลี่ยน

   กติกาใหม่: ปัดขึ้นเฉพาะเมื่อ "ซื้อมาถึงสัดส่วนที่คุ้มแล้ว" ที่เหลือปัดลง (เศษที่ไม่ครบ
   ขั้นไม่ได้ของแถมอยู่ดี) แล้วเอาไปตัดสินที่หน้าตรวจโปรจุดเดียว พร้อมโชว์เลขเดิม
   ------------------------------------------------------------------------------- */

/** ขั้นล่าง/ขั้นบนที่ขนาบยอดนี้ — null = ไม่มีโปรของแถม (ไม่มีอะไรต้องปัด) */
export function promoStepBounds(
  tiers: PromoTierInput[] | null | undefined,
  qty: number
): { down: number; up: number } | null {
  const lots = promoStepLots(tiers);
  if (lots.length === 0) return null;
  const q = Math.max(0, Math.floor(qty));
  // ยังไม่ถึงขั้นแรก — ขั้นล่างคือ "ไม่ซื้อรอบนี้" ไม่ใช่ขั้นแรก
  if (q < lots[0]!) return { down: 0, up: lots[0]! };
  return { down: stepDownFrom(lots, q), up: stepUpFrom(lots, q + 1) };
}

/** ล็อตใหญ่ = ต้องซื้อเกินจำนวนนี้ถึงจะได้ของแถม 1 ชิ้น */
export const PROMO_BIG_LOT = 12;

/**
 * สัดส่วนของขั้นที่ต้องซื้อถึงก่อน จึงจะคุ้มที่จะปัดขึ้นไปรับของแถม
 *
 * ปกติ 30% — แต่ล็อตที่ต้องซื้อเกิน 12 หีบถึงจะแถม 1 การขยับขึ้นอีกขั้นคือของเพิ่ม
 * เป็นสิบหีบ ต้องซื้อถึงครึ่งขั้นก่อนถึงจะสมเหตุสมผล
 */
export function promoRoundUpRatio(lot: number): number {
  return lot > PROMO_BIG_LOT ? 0.5 : 0.3;
}

export interface PromoStepRound {
  /** จำนวนก่อนปรับ — ที่ร้านสั่งไว้หรือที่ระบบแนะนำ */
  requested: number;
  applied: number;
  /** ขั้นที่ลงตัวขั้นล่าง (0 = ยังไม่ถึงขั้นแรก) */
  down: number;
  /** ขั้นที่ลงตัวขั้นถัดขึ้นไป */
  up: number;
  /** ขนาดขั้นที่กำลังตัดสิน = up − down */
  lot: number;
  /** เศษที่เลยขั้นล่างมา ÷ ขนาดขั้น */
  ratio: number;
  threshold: number;
  direction: "up" | "down";
}

/**
 * แผนปรับจำนวนของบรรทัดเดียว — null = ไม่ต้องปรับ
 *
 * null เมื่อ: ไม่สั่ง (0), ไม่มีโปรของแถม, หรือจำนวนลงขั้นพอดีอยู่แล้ว
 */
export function planPromoStepRound(
  tiers: PromoTierInput[] | null | undefined,
  qty: number
): PromoStepRound | null {
  const q = Math.max(0, Math.floor(qty));
  if (q <= 0) return null;
  const bounds = promoStepBounds(tiers, q);
  if (!bounds) return null;
  const { down, up } = bounds;
  if (down === q) return null;

  const lot = up - down;
  const ratio = (q - down) / lot;
  const threshold = promoRoundUpRatio(lot);
  const applied = ratio > threshold ? up : down;
  return {
    requested: q,
    applied,
    down,
    up,
    lot,
    ratio,
    threshold,
    direction: applied === up ? "up" : "down",
  };
}

/** ข้อความอธิบายว่าทำไมจำนวนถึงเปลี่ยน — ใช้ทั้งบรรทัดเดี่ยวและยอดรวมกลุ่ม */
export function promoStepRoundReason(round: {
  lot: number;
  ratio: number;
  threshold: number;
  direction: "up" | "down";
}): string {
  const pct = Math.round(round.ratio * 100);
  const limit = Math.round(round.threshold * 100);
  return round.direction === "up"
    ? `ซื้อไปแล้ว ${pct}% ของขั้น (เกิน ${limit}%) — ปัดขึ้นให้ครบขั้นละ ${round.lot} หีบ จะได้ของแถม`
    : `ซื้อไปแค่ ${pct}% ของขั้น (ไม่ถึง ${limit}%) — ส่วนที่ไม่ครบขั้นละ ${round.lot} หีบ ไม่ได้ของแถม`;
}

export interface PromoGroupRoundChange {
  skuCode: string;
  from: number;
  to: number;
}

export interface PromoGroupStepRound {
  lot: number;
  /** ขั้นที่ลงตัวที่ขนาบยอดรวมอยู่ — ใช้บอกว่ากำลังพูดถึงขั้นโปรไหน */
  down: number;
  up: number;
  pool: number;
  target: number;
  /** ส่วนที่ต้องปรับให้ยอดรวมลงตัว — ติดลบ = ต้องลดลง */
  delta: number;
  ratio: number;
  threshold: number;
  direction: "up" | "down";
  /** บรรทัดที่ต้องเปลี่ยนจริง — ปัดขึ้นเติมที่เดียว ปัดลงไล่ตัดจากบรรทัดที่สั่งเยอะสุด */
  changes: PromoGroupRoundChange[];
}

/**
 * แผนปรับ "ยอดรวมกลุ่ม" ด้วยกติกาสัดส่วนเดียวกับบรรทัดเดี่ยว
 *
 * ต่างจาก planPromoGroupStepFix ตรงที่ยอมให้ผลลัพธ์เป็น 0 ได้ (ยอดรวมยังไม่ถึงสัดส่วน
 * ของขั้นแรก = ทั้งกลุ่มยังไม่ต้องซื้อรอบนี้) จึงต้องกระจายส่วนที่ลดข้ามหลายบรรทัด
 * ไม่ใช่หักที่บรรทัดเดียวแบบเดิม ซึ่งจะได้จำนวนติดลบ
 */
export function planPromoGroupStepRound(
  tiers: PromoTierInput[] | null | undefined,
  members: PromoStepGroupMember[],
  opts?: { excludeSku?: string }
): PromoGroupStepRound | null {
  const inOrder = members
    .map((m) => ({ ...m, qty: Math.max(0, Math.floor(m.qty)) }))
    .filter((m) => m.qty > 0);
  const pool = inOrder.reduce((sum, m) => sum + m.qty, 0);
  if (pool <= 0) return null;

  const round = planPromoStepRound(tiers, pool);
  if (!round) return null;

  const head = {
    lot: round.lot,
    down: round.down,
    up: round.up,
    pool,
    target: round.applied,
    delta: round.applied - pool,
    ratio: round.ratio,
    threshold: round.threshold,
    direction: round.direction,
  };

  // ปัดขึ้น: เติมที่บรรทัดเดียว — ตัวที่ระบบแนะนำมากสุดในบรรดาที่สั่งอยู่แล้ว
  if (head.delta > 0) {
    const host =
      [...inOrder]
        .sort(
          (a, b) =>
            (b.suggestOrder ?? 0) - (a.suggestOrder ?? 0) ||
            b.qty - a.qty ||
            a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true })
        )
        .find((m) => m.skuCode !== opts?.excludeSku) ?? inOrder[0]!;
    return {
      ...head,
      changes: [
        { skuCode: host.skuCode, from: host.qty, to: host.qty + head.delta },
      ],
    };
  }

  // ปัดลง: ไล่ตัดจากบรรทัดที่สั่งเยอะสุดก่อน จนครบส่วนที่ต้องลด (ไม่มีใครติดลบ)
  let need = -head.delta;
  const changes: PromoGroupRoundChange[] = [];
  const order = [...inOrder].sort(
    (a, b) =>
      b.qty - a.qty ||
      (a.suggestOrder ?? 0) - (b.suggestOrder ?? 0) ||
      a.skuCode.localeCompare(b.skuCode, undefined, { numeric: true })
  );
  for (const m of order) {
    if (need <= 0) break;
    const cut = Math.min(need, m.qty);
    if (cut <= 0) continue;
    changes.push({ skuCode: m.skuCode, from: m.qty, to: m.qty - cut });
    need -= cut;
  }
  return { ...head, changes };
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
