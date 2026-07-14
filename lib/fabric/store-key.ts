/** normalize รหัสร้าน/VDA ให้เป็นรูปแบบเดียว
 *  "VDA_1-ชื่อร้าน" / "VDA 1" / "vda1" → "vda1" · อื่น ๆ → lowercase + trim
 *  ใช้ร่วมทุกที่ (sold-history / vda-aos-bill / verify) กัน key mismatch */
export function normalizeStoreKey(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  const vda = s.match(/^vda[_\s-]?(\d+)/);
  if (vda) return `vda${vda[1]}`;
  return s;
}
