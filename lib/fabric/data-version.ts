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

// version ระดับ process — bump ทุกครั้งที่ดึง master ใหม่จาก OneLake
// ต้องมีแยกจาก mtime signature เพราะบางรอบไฟล์ mtime ไม่เปลี่ยน (โหลดได้ไฟล์เดิม)
// แต่ระบบ reload ตารางในหน่วยความจำแล้ว แท็บที่เปิดอยู่ควรได้รู้
let globalVersion = 0;

export function bumpDataVersion(): void {
  globalVersion += 1;
}

export function globalDataVersion(): number {
  return globalVersion;
}
