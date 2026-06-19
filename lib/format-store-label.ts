/** แสดงชื่อร้าน/VDA ครั้งเดียว — ไม่ซ้ำ vda1 กับ VDA1 */
export function formatStoreLabel(code: string, name?: string | null): string {
  const rawCode = code.trim();
  const rawName = (name ?? "").trim();
  if (!rawName) return rawCode.toUpperCase();

  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  if (norm(rawCode) === norm(rawName)) return rawCode.toUpperCase();

  // ชื่อเป็นแค่ uppercase ของ code
  if (rawName.toUpperCase() === rawCode.toUpperCase()) return rawCode.toUpperCase();

  return rawName;
}

export function formatCompactBaht(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m >= 10 ? m.toFixed(0) : m.toFixed(1)} ล้าน`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${value.toLocaleString("th-TH")} บาท`;
}

export function formatQtyPair(suggested: number, ordered: number): string {
  if (suggested === ordered) return String(ordered);
  return `${suggested}→${ordered}`;
}
