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
    value: "sending_erp",
    label: "กำลังส่ง ERP",
    hint: "กำลังยิงเข้า ERP อยู่ — อย่ากดซ้ำ ถ้าค้างนานผิดปกติให้ตรวจกับ ERP ก่อนลองใหม่",
    tone: "amber",
  },
  {
    value: "sent_erp",
    label: "เข้า ERP แล้ว",
    hint: "ปลายทางรับเข้าระบบแล้ว (ยังไม่ได้แปลว่าออกบิลแล้ว)",
    tone: "teal",
  },
  {
    // ส่งแล้วไม่รู้ผล (timeout / เน็ตหลุด / HTTP error) — เดิมถอยกลับเป็น "ออกแล้ว" ทำให้ดูเหมือน
    // ยังไม่เคยส่ง ทั้งที่อาจเข้า ERP ไปแล้ว (QA 28 ก.ย. 69)
    value: "erp_unknown",
    label: "ERP ไม่ตอบ — รอตรวจ",
    hint: "ส่งแล้วแต่ไม่รู้ผล อาจเข้า ERP ไปแล้ว — ห้ามส่งซ้ำ ตรวจกับทีม ERP แล้วกดบันทึกผลในรายละเอียด PO",
    tone: "orange",
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

/**
 * สถานะระหว่าง/หลังส่งเข้า ERP — ประกาศเป็นค่าคงที่ให้ route อ้างถึงได้โดยไม่พิมพ์สตริงเอง
 *
 * `sent_erp` ต่างจาก `sent` ("ส่งซัพแล้ว") ที่เป็นป้ายที่คนกดเองหลังเอาไฟล์ไปส่ง —
 * ตัวนี้เครื่องเป็นคนปัก และหมายถึง "ปลายทางรับ insert แล้ว" เท่านั้น
 * **ไม่ได้แปลว่าออกบิลแล้ว** (ฝั่ง ocr ยืนยันว่า RECORDSTATUS=C ก็แค่รับเข้าระบบ บิลอยู่คนละตาราง)
 */
export const SENDING_TO_ERP = "sending_erp";
export const SENT_TO_ERP = "sent_erp";
export const ERP_RESULT_UNKNOWN = "erp_unknown";

/** สถานะที่ระบบตั้งเองตอนส่ง ERP — คนเลือกเองจาก dropdown ไม่ได้ */
export const SYSTEM_ONLY_PO_STATUSES: readonly string[] = [
  SENDING_TO_ERP,
  SENT_TO_ERP,
  ERP_RESULT_UNKNOWN,
];

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
  // เพิ่มพร้อมสถานะ ERP — ตกหล่นเมื่อไหร่ป้ายจะกลายเป็นเทาเงียบ ๆ ไม่พัง แต่ก็ไม่สื่อ
  amber:
    "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  teal: "bg-teal-100 text-teal-800 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900",
  orange:
    "bg-orange-100 text-orange-800 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900",
};

/**
 * สถานะที่ยังตั้งเองได้หลัง PO อาจอยู่ใน ERP แล้ว — มีแค่ "รับของแล้ว" ซึ่งเป็นขั้นหลัง ERP จริง
 *
 * ที่เหลือห้ามหมด: ยกเลิก = ฝั่งเราบอกร้านว่าของไม่มา แต่ ERP ยังเปิดบิลอยู่ ·
 * ถอยกลับเป็น "ออกแล้ว/ส่งซัพแล้ว" = จอบอกว่ายังไม่เข้า ERP ทั้งที่เข้าแล้ว (QA 28 ก.ย. 69)
 */
export const PO_STATUSES_AFTER_ERP: readonly PoStatus[] = ["received"];

/**
 * PO ใบนี้อาจอยู่ใน ERP แล้วหรือไม่ — ส่งสำเร็จ หรือเคยลองส่งแล้วผลไม่ชัดเจน (timeout/network/
 * แถวเก่าที่ไม่มี failureKind) · ถูก ERP ปฏิเสธชัดเจน (`rejected`) = ไม่ได้เข้า
 *
 * ฟังก์ชันล้วน รับได้ทั้ง Date (ฝั่ง server) และ ISO string (แถวที่หน้า PO ได้จาก API)
 */
export function poMayBeInErp(po: {
  erpSentAt: Date | string | null;
  erpAttemptedAt?: Date | string | null;
  erpError?: string | null;
  erpFailureKind?: string | null;
}): boolean {
  if (po.erpSentAt) return true;
  const attempted = po.erpAttemptedAt != null || po.erpError != null;
  return attempted && po.erpFailureKind !== "rejected";
}

export type ManualPoStatusVerdict =
  | { ok: true; reopened: boolean }
  | { ok: false; httpStatus: 400 | 409; error: string };

/**
 * ตรวจการเปลี่ยนสถานะ PO ด้วยมือ (PATCH จากหน้า PO) — แยกเป็นฟังก์ชันล้วนให้ทดสอบได้
 *
 * `mayBeInErp` ให้ผู้เรียกคำนวณจาก `poMayBeInErp()` ด้านบน
 */
export function checkManualPoStatusChange(args: {
  from: string;
  to: PoStatus;
  mayBeInErp: boolean;
}): ManualPoStatusVerdict {
  const { from, to, mayBeInErp } = args;
  // สองค่านี้ต้องมาจาก send-erp เท่านั้น — ตั้งเองได้ = จอบอก "เข้า ERP แล้ว" ทั้งที่ไม่เคยส่ง
  if (SYSTEM_ONLY_PO_STATUSES.includes(to)) {
    return {
      ok: false,
      httpStatus: 400,
      error: "สถานะนี้ระบบตั้งให้เองตอนส่งเข้า ERP — เปลี่ยนเองไม่ได้",
    };
  }
  // กำลังยิงอยู่ = ยังไม่รู้ผล ถ้าเปลี่ยนตอนนี้ send-erp จะเขียนทับอยู่ดี หรือแย่กว่าคือยกเลิกใบที่เพิ่งเข้าไป
  if (from === SENDING_TO_ERP) {
    return {
      ok: false,
      httpStatus: 409,
      error:
        "ใบนี้กำลังส่งเข้า ERP อยู่ — รอผลก่อน ถ้าค้างนานผิดปกติให้ตรวจกับทีม ERP ก่อนเปลี่ยนสถานะ",
    };
  }
  if (mayBeInErp && to !== from && !PO_STATUSES_AFTER_ERP.includes(to)) {
    return {
      ok: false,
      httpStatus: 409,
      error:
        to === "cancelled"
          ? "ใบนี้อยู่ใน ERP แล้ว (หรือส่งแล้วผลไม่ชัดเจน) — ต้องยกเลิกในระบบ ERP ก่อน แล้วค่อยแจ้งผู้ดูแลระบบให้ปรับสถานะที่นี่"
          : "ใบนี้อยู่ใน ERP แล้ว (หรือส่งแล้วผลไม่ชัดเจน) — เปลี่ยนได้แค่เป็น \"รับของแล้ว\" · ถ้าต้องแก้อย่างอื่นให้แก้ในระบบ ERP ก่อน",
    };
  }
  return { ok: true, reopened: from === "cancelled" && to !== "cancelled" };
}
