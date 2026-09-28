/**
 * เดิมคัดลอกรายชื่อพนักงานจาก cross_salesman master ลงตาราง SalesRep ทุกครั้งที่ sync
 *
 * เลิกใช้ master ตั้งแต่ 28 ก.ย. 2569 (รหัส SXXX ที่ใช้จริงไม่มีในไฟล์นั้น) — แถว SalesRep ถูกสร้าง
 * ตอนผูกร้าน VDA กับอีเมลที่แอดมินผูกไว้แทน (ensureVdaStoreSalesRep) · คงฟังก์ชันไว้ให้ scheduler
 * เรียกได้เหมือนเดิม แต่ไม่ทำอะไร
 */
export async function syncFabricSalesReps(): Promise<number> {
  return 0;
}
