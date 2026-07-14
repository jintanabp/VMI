// version ข้อมูล stock "ต่อร้าน" — bump ทุกครั้งที่แก้ threshold (per-SKU/Section) หรือ blocklist ของร้านนั้น
// ผูกไว้ใน cacheKey ของ payload เพื่อ bust cache เฉพาะร้านที่เปลี่ยน (ไม่ล้าง cache ร้านอื่น)
// ตั้งใจให้ไม่มี dependency อื่น เพื่อกัน circular import (repository/route/fabric เรียกได้หมด)

const versions = new Map<string, number>();

export function bumpStoreDataVersion(storeId: string): void {
  versions.set(storeId, (versions.get(storeId) ?? 0) + 1);
}

export function storeDataVersion(storeId: string): number {
  return versions.get(storeId) ?? 0;
}
