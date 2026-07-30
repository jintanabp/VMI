import { NextResponse } from "next/server";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { datasetVersion, ensureFabricMastersFresh } from "@/lib/fabric";
import { readMasterRefreshStatus } from "@/lib/fabric/refresh-status";
import { maxDataAgeHours, runMasterRefresh } from "@/lib/fabric/scheduler";

/**
 * "ตรวจข้อมูลใหม่" ฝั่งร้านค้า
 *
 * เดิม route นี้มี orchestrator ของตัวเองที่ดึงแค่ stock_cover_day + factsales_odoo
 * (2 จาก 8 ไฟล์) ⇒ ร้านได้สต็อกใหม่แต่ราคา/โปรเก่า คนละชุดกับที่แอดมินเห็น
 *
 * ตอนนี้: อ่านชุดข้อมูลกลางซ้ำเสมอ และสั่งดึงจาก Fabric จริงเฉพาะเมื่อชุดกลาง
 * เก่ากว่า MASTER_REFRESH_MAX_AGE_HOURS โดยผ่าน runMasterRefresh ที่มี in-flight
 * guard — ร้าน 20 ร้านกดพร้อมกันเสียแค่ 1 ดาวน์โหลด
 */
export async function POST() {
  const store = await getCustomerStoreFromCookie();
  if (!store) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = readMasterRefreshStatus();
  const maxAgeMs = maxDataAgeHours() * 3_600_000;
  const stale =
    !status.lastSuccessAt ||
    Date.now() - Date.parse(status.lastSuccessAt) > maxAgeMs;

  let queued = false;
  if (stale) {
    // ไม่ await — ปุ่มต้องตอบทันที ระบบจะแจ้งหน้าเว็บเองผ่าน /api/data-version
    void runMasterRefresh({ trigger: "store" }).catch((err) => {
      console.warn("[stock/refresh] background refresh failed:", err);
    });
    queued = true;
  }

  // รับงานที่ process/รอบอื่นโหลดไว้แล้วผ่าน mtime signature
  ensureFabricMastersFresh();

  return NextResponse.json({
    ok: true,
    queued,
    version: datasetVersion(),
    lastSuccessAt: status.lastSuccessAt ?? null,
    message: queued
      ? "ข้อมูลกลางเก่ากว่ากำหนด — กำลังดึงใหม่ ระบบจะอัปเดตให้เองเมื่อเสร็จ"
      : "ข้อมูลเป็นชุดล่าสุดแล้ว",
  });
}
