import { NextResponse } from "next/server";
import {
  datasetVersion,
  ensureFabricMastersFresh,
  getAssortedMapping,
} from "@/lib/fabric";

/**
 * ชื่อกลุ่มโปรทั้งชุด (รหัส → ชื่อ) สำหรับฝั่ง client
 *
 * ส่งทั้งก้อนครั้งเดียว (~450 กลุ่ม / ไม่กี่สิบ KB) แทนที่จะแนบชื่อไปกับทุกแถวในทุก API
 * ที่มี promoGroup — หน้า stock/order/PO/ประวัติ ใช้ queryKey เดียวกันจึงยิงครั้งเดียวต่อ session
 * ไม่มีข้อมูลลูกค้าหรือราคาอยู่ในนี้ จึงไม่ผูกกับสิทธิ์ร้าน
 */
export async function GET() {
  // หลัง sync รอบใหม่ ไฟล์บนดิสก์เปลี่ยนแต่ singleton ยังถือของเก่า
  ensureFabricMastersFresh();
  const mapping = getAssortedMapping();
  return NextResponse.json(
    {
      names: mapping.toRecord(),
      count: mapping.size,
      version: datasetVersion(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
