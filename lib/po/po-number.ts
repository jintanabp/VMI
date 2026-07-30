/**
 * เลข PO
 *
 * ยึดข้อจำกัดเดียวกับ ocr-po-matching (`backend/schemas.py`): ยาว ≤12 ตัว
 * และมีแต่ A-Z 0-9 เพราะปลายทางคือ Oracle ตัวเดียวกัน
 *
 * ต่างกันที่ ocr-po-matching **อ่าน** เลข PO จากเอกสารของลูกค้า ส่วน VMI
 * ออเดอร์เกิดในระบบเอง จึงต้อง mint เลขเอง แต่การ derive เลขลูกจากเลขแม่
 * ยืมแนวเดียวกับ `buildChildPo(parent, runningNo, "back")`
 */

export const PO_NUMBER_MAX_LEN = 12;

const PO_NUMBER_RE = /^[A-Z0-9]+$/;

/** เหลือแต่ A-Z 0-9 ตัวพิมพ์ใหญ่ — เทียบ sanitize_po_number */
export function sanitizePoNumber(value: string): string {
  return (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** โยน Error ข้อความไทยเมื่อรูปแบบผิด (ใช้ตอนพนักงานพิมพ์เลขเอง) */
export function checkPoNumberFormat(value: string): void {
  const s = (value ?? "").trim();
  if (!s) throw new Error("ต้องระบุเลข PO");
  if (s.length > PO_NUMBER_MAX_LEN) {
    throw new Error(`เลข PO ต้องยาวไม่เกิน ${PO_NUMBER_MAX_LEN} ตัวอักษร`);
  }
  if (!PO_NUMBER_RE.test(s)) {
    throw new Error("เลข PO ใช้ได้เฉพาะตัวอักษร A-Z และตัวเลข 0-9");
  }
}

/** "vda2" → "V2" · "vda10" → "V10" · อย่างอื่นตัดเหลือ 3 ตัวแรก */
export function vdaPoPrefix(vdaCode: string): string {
  const clean = sanitizePoNumber(vdaCode);
  const m = /^VDA(\d+)$/.exec(clean);
  if (m) return `V${m[1]}`;
  return clean.slice(0, 3) || "PO";
}

/** วัน ค.ศ. 2 หลัก เขตเวลาไทย — YYMMDD */
export function bangkokYYMMDD(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}`;
}

/**
 * เลขแม่: V2 + 260730 + 01 = V226073001 (10 ตัว)
 * ลำดับเกิน 99 ในวันเดียวขยายเป็น 3 หลักเอง — suffix เลขลูกยังพอดี 12 ตัว
 */
export function buildBasePoNumber(
  prefix: string,
  date: Date,
  seq: number
): string {
  const seqText = seq < 100 ? String(seq).padStart(2, "0") : String(seq);
  const base = `${sanitizePoNumber(prefix)}${bangkokYYMMDD(date)}${seqText}`;
  // เผื่อที่ให้ suffix ของเลขลูก 1 ตัว
  if (base.length > PO_NUMBER_MAX_LEN - 1) {
    throw new Error(
      `เลข PO ยาวเกินกำหนด (${base.length} ตัว) — ตรวจรหัสคลังหรือลำดับที่วิ่งเกิน`
    );
  }
  return base;
}

/** เลขลูก: ต่อ groupKey ท้ายเลขแม่ (เทียบ buildChildPo placement="back") */
export function buildChildPoNumber(base: string, groupKey: string): string {
  const child = `${base}${sanitizePoNumber(groupKey)}`;
  checkPoNumberFormat(child);
  return child;
}

/** ตัวอักษรกลุ่มตามลำดับ A, B, C, … */
export function groupKeyAt(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}
