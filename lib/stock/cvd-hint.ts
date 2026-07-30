import type { CvdFlag, CvdFlagReason } from "@/lib/calculations";

/** คำอธิบายธง CVD หลังสั่ง — บอกให้ชัดว่าทำไมเป็นสีนี้ และต้องทำอะไรต่อ */
export function cvdFlagHint(
  flag: CvdFlag,
  reason: CvdFlagReason,
  row: { minDays: number; maxDays: number }
): string {
  if (reason === "minPack") {
    return `สินค้าขายช้า — 1 หีบคือจำนวนขั้นต่ำที่สั่งได้ จึงพอขายได้นานกว่าเป้าหมาย ${row.minDays}–${row.maxDays} วัน สั่งได้ตามปกติ`;
  }
  if (reason === "outOfStock") {
    return `ของหมดแล้ว — สั่งเท่านี้ยังไม่ถึงเป้าหมาย ${row.minDays} วัน แต่สั่งได้เลย เพิ่มจำนวนถ้าคลังมีให้เบิก`;
  }
  if (reason === "under") {
    return `สั่งเท่านี้ยังไม่ถึงเป้าหมายขั้นต่ำ ${row.minDays} วัน — เพิ่มจำนวนก่อนส่งคำสั่ง`;
  }
  if (reason === "over") {
    return `สั่งเท่านี้จะมีของค้างเกินเป้าหมาย ${row.maxDays} วันมาก — ลดจำนวนก่อนส่งคำสั่ง`;
  }
  if (flag === "yellow") {
    return `เกินเป้าหมาย ${row.maxDays} วันเล็กน้อย — ยังสั่งได้`;
  }
  return `อยู่ในเป้าหมาย ${row.minDays}–${row.maxDays} วัน`;
}
