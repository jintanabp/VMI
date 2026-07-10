// ตัวนับเวอร์ชันข้อมูล stock — bump ทุกครั้งที่มีการแก้ threshold (per-SKU หรือ Section)
// ใช้เป็นส่วนหนึ่งของ cache signature ใน buildFabricStockPayload เพื่อ bust cache ให้ถูกต้อง
// ตั้งใจให้ไม่มี dependency อื่น เพื่อกัน circular import (repository/route/fabric เรียกได้หมด)

let version = 0;

export function bumpStockDataVersion(): void {
  version++;
}

export function stockDataVersion(): number {
  return version;
}
