/**
 * สถานะของ PO หลังออกเลขแล้ว
 *
 * **ค่าพวกนี้ตั้งใจให้แก้ได้โดยไม่ต้อง migrate** — คอลัมน์ใน DB เป็น `String`
 * ไม่ใช่ enum เพราะ flow จริงของฝ่ายจัดซื้อยังไม่นิ่ง
 * ถ้าจะเพิ่ม/เปลี่ยนขั้นตอน แก้แค่ไฟล์นี้ไฟล์เดียว:
 *   - เพิ่มค่าใน PO_STATUSES (ลำดับในอาร์เรย์ = ลำดับใน UI)
 *   - ของเดิมใน DB ที่ไม่ตรงค่าใหม่จะถูกมองเป็น "ไม่ทราบสถานะ" ไม่พัง
 *
 * ค่าเริ่มต้นคือ `issued` — PO ที่ออกก่อนมีฟีเจอร์นี้จะได้ค่านี้อัตโนมัติ
 */
export const PO_STATUSES = [
  {
    value: "issued",
    label: "ออกแล้ว",
    hint: "ออกเลข PO แล้ว รอส่งให้ซัพพลายเออร์",
    tone: "slate",
  },
  {
    value: "sent",
    label: "ส่งซัพแล้ว",
    hint: "ส่งใบสั่งซื้อให้ซัพพลายเออร์แล้ว รอของ",
    tone: "sky",
  },
  {
    value: "received",
    label: "รับของแล้ว",
    hint: "ของเข้าคลังครบแล้ว",
    tone: "emerald",
  },
  {
    value: "cancelled",
    label: "ยกเลิก",
    hint: "ยกเลิกใบนี้ ไม่ต้องส่งของ",
    tone: "red",
  },
] as const;

export type PoStatus = (typeof PO_STATUSES)[number]["value"];

export const DEFAULT_PO_STATUS: PoStatus = "issued";

export function isPoStatus(v: unknown): v is PoStatus {
  return (
    typeof v === "string" && PO_STATUSES.some((s) => s.value === v)
  );
}

/** คืนข้อมูลสถานะสำหรับแสดงผล — ค่าที่ไม่รู้จักไม่ทำให้หน้าพัง */
export function poStatusMeta(value: string | null | undefined) {
  return (
    PO_STATUSES.find((s) => s.value === value) ?? {
      value: value || "unknown",
      label: value || "ไม่ทราบสถานะ",
      hint: "ค่าสถานะนี้ไม่มีใน PO_STATUSES — อาจถูกลบออกหลังบันทึกไปแล้ว",
      tone: "slate" as const,
    }
  );
}

/** คลาส Tailwind ต่อ tone — แยกจาก data เพื่อให้ค่าสถานะเป็นข้อความล้วน */
export const PO_STATUS_CLASS: Record<string, string> = {
  slate:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  sky: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
  emerald:
    "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  red: "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
};
