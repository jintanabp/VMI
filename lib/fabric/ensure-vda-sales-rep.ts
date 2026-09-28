import { prisma } from "@/lib/prisma";
import { getVdaAosBillRegistry, isVdaStoreCode } from "./vda-aos-bill";
import { getLinkedEmailsForCode } from "@/lib/auth/manual-salesman-assignments";

/**
 * ผูก Store (VDA) กับ SalesRep — รหัสเซลล์หลักของ VDA มาจากทะเบียน VDA (VDA_SALESMAN_MAP) ·
 * อีเมลของรหัสนั้นมาจากที่แอดมินผูกไว้ในหน้า «สิทธิ์เซลล์-VDA» (ไม่ใช้ cross_salesman master แล้ว)
 *
 * สิทธิ์ดูออเดอร์ของร้าน VDA ไม่ได้ขึ้นกับค่านี้ (ตัดสินจากรหัส ↔ VDA) — ใช้กับตัวกรอง "ตามเซลล์"
 * ในหน้าออเดอร์ของ creator เป็นหลัก
 */
export async function ensureVdaStoreSalesRep(
  storeId: string,
  vdaCode: string
): Promise<string | null> {
  if (!isVdaStoreCode(vdaCode)) return null;

  const salesmanCode = getVdaAosBillRegistry().getPrimarySalesmanForVda(vdaCode);
  if (!salesmanCode) {
    console.warn(`[VdaSalesRep] No salesman for ${vdaCode} — ตรวจ VDA_CUSTOMER_MAP และไฟล์ cross_target`);
    return null;
  }

  const [email] = await getLinkedEmailsForCode(salesmanCode);
  if (!email) {
    console.warn(
      `[VdaSalesRep] รหัส ${salesmanCode} ของ ${vdaCode} ยังไม่ได้ผูกอีเมล — เพิ่มที่แท็บ «สิทธิ์เซลล์-VDA»`
    );
    return null;
  }

  const name = `รหัส ${salesmanCode.trim().toUpperCase()}`;
  const rep = await prisma.salesRep.upsert({
    where: { email },
    create: { email, name },
    update: {},
  });

  await prisma.store.update({
    where: { id: storeId },
    data: { salesRepId: rep.id },
  });

  return rep.id;
}
