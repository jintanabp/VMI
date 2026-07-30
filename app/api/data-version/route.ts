import { NextResponse } from "next/server";
import { datasetVersion } from "@/lib/fabric";
import { bangkokDateStr } from "@/lib/fabric/bkk-date";
import { readMasterRefreshStatus } from "@/lib/fabric/refresh-status";
import { isRefreshRunning } from "@/lib/fabric/scheduler";

export const dynamic = "force-dynamic";

/**
 * ตัวบอกว่าชุดข้อมูลกลางเปลี่ยนหรือยัง — ทุกแท็บที่เปิดอยู่ poll ตัวนี้แทนการรอคนกดรีเฟรช
 * ราคาถูกโดยเจตนา: statSync 6 ครั้ง + อ่านไฟล์ status เล็ก ๆ ไม่แตะ DB ไม่ parse CSV
 */
export async function GET() {
  const status = readMasterRefreshStatus();
  return NextResponse.json(
    {
      version: datasetVersion(),
      dataDate: bangkokDateStr(new Date()),
      lastSuccessAt: status.lastSuccessAt ?? null,
      refreshing: isRefreshRunning(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
