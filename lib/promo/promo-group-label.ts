/**
 * ชื่อกลุ่มโปรที่เอาไปแสดง — ใช้ได้ทั้ง server และ client
 *
 * รหัสกลุ่ม (ASSORTEDPRODUCTGROUP) ยังเป็น "คีย์" ของทุกอย่างเหมือนเดิม: key ของ map,
 * React key, พารามิเตอร์ที่ส่งไป API ห้ามเปลี่ยนไปใช้ชื่อ เพราะชื่อซ้ำกันได้และ
 * เปลี่ยนได้ทุกครั้งที่ทีมมาร์เก็ตติ้งอัปเดตไฟล์ — ตรงนี้ทำหน้าที่ "แปลงตอนแสดงผล" อย่างเดียว
 */
export type PromoGroupNames = Readonly<Record<string, string>>;

/** ชื่อกลุ่มถ้ามี ไม่งั้นรหัสกลุ่มเดิม (ไฟล์จริงมีหลายสิบกลุ่มที่คำอธิบายว่าง) */
export function promoGroupLabel(
  group: string | null | undefined,
  names?: PromoGroupNames | null
): string {
  const code = group?.trim() ?? "";
  if (!code) return "";
  return names?.[code]?.trim() || code;
}

/**
 * ชื่อแบบสั้นสำหรับที่แคบ (คอลัมน์โปรในตารางกว้าง ~220px)
 *
 * ชื่อจริงหลายตัวเป็น "ชื่อสินค้า + วงเล็บไล่รส" เช่น
 * `เปาซุปเปอร์2700G(ไวท์,ซอฟท์,คัลเลอร์)` — ส่วนที่บอกว่าเป็นโปรอะไรคือหน้าวงเล็บ
 * ในวงเล็บคือรายการรสซึ่งยาวจนดันชื่อหลักหายไปเป็น "..." ทั้งที่เป็นส่วนที่ไม่ต้องอ่านตอนกวาดตา
 * (ชื่อเต็มยังอยู่ครบใน tooltip และแถวหัวกลุ่มที่กว้างเต็มตาราง)
 */
export function promoGroupShortLabel(
  group: string | null | undefined,
  names?: PromoGroupNames | null,
  maxLen = 26
): string {
  const full = promoGroupLabel(group, names);
  const code = group?.trim() ?? "";
  // ตัดวงเล็บทิ้งเฉพาะตอนที่เหลือข้อความหน้าวงเล็บพอให้รู้เรื่อง
  const head = full.split("(")[0]!.trim();
  const short = head.length >= 4 ? head : full;
  if (short.length <= maxLen) return short;
  // ยาวเกินจริง ๆ — ตัดที่ตัวคั่นตัวสุดท้ายก่อนขีดจำกัด จะได้ไม่ตัดกลางคำ
  const cut = short.slice(0, maxLen);
  const sep = Math.max(cut.lastIndexOf("/"), cut.lastIndexOf(" "));
  return `${(sep >= maxLen / 2 ? cut.slice(0, sep) : cut).trim()}…`;
}

/** สั้นลงจริงหรือไม่ — ใช้ตัดสินว่าต้องมี tooltip บอกชื่อเต็มไหม */
export function isPromoGroupLabelShortened(
  group: string | null | undefined,
  names?: PromoGroupNames | null,
  maxLen = 26
): boolean {
  return (
    promoGroupShortLabel(group, names, maxLen) !== promoGroupLabel(group, names)
  );
}

/** ข้อความ tooltip — เห็นทั้งชื่อและรหัสไว้เทียบกับ C4 */
export function promoGroupTooltip(
  group: string | null | undefined,
  names?: PromoGroupNames | null
): string {
  const code = group?.trim() ?? "";
  if (!code) return "";
  const name = names?.[code]?.trim();
  return name ? `${name} · รหัสกลุ่ม ${code}` : `กลุ่ม ${code}`;
}

/** true = มีชื่อจริง (ไม่ใช่ fallback รหัส) — ใช้ตัดสินว่าจะโชว์รหัสควบไปด้วยไหม */
export function hasPromoGroupName(
  group: string | null | undefined,
  names?: PromoGroupNames | null
): boolean {
  const code = group?.trim() ?? "";
  return Boolean(code && names?.[code]?.trim());
}
