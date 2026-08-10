import { fabricMastersReady, getCustomerDirectory } from "./index";
import { getVdaAosBillRegistry } from "./vda-aos-bill";

/**
 * ชื่อร้านของคลัง VDA
 *
 * map vda → customercode (จาก env VDA_CUSTOMER_MAP)
 * แล้วดึง Customer_NameThai จาก dim_customer
 * คืนค่าว่างเมื่อไม่มี mapping / ยังไม่โหลด master / หาไม่เจอ
 *
 * แยกไฟล์จาก vda-aos-bill.ts เพราะ lib/fabric/index.ts import โมดูลนั้นอยู่ —
 * ใส่ไว้ที่นั่นจะเกิด circular import
 */
export function resolveVdaStoreName(vdaCode: string): string {
  const codes = getVdaAosBillRegistry().getCustomerCodesForVda(vdaCode);
  if (codes.length === 0) return "";
  if (!fabricMastersReady()) return "";
  const dir = getCustomerDirectory();
  for (const code of codes) {
    const name = dir.getByCode(code)?.name?.trim();
    if (name) return name;
  }
  return "";
}

/** ชื่อร้านของทุก VDA ที่ resolve ได้ — ใช้ในหน้าเลือก VDA */
export function resolveVdaStoreNames(vdaCodes: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of vdaCodes) {
    const name = resolveVdaStoreName(code);
    if (name) out[code] = name;
  }
  return out;
}
