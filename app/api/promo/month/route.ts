import { NextResponse } from "next/server";
import { getSalesSession } from "@/lib/auth/sales-session";
import { listStockFromDbSources } from "@/lib/fabric/stock-rows";
import { buildPromoMonthReport } from "@/lib/promo/promo-month";
import {
  ownedVdaCodesForSession,
  pickPromoStoreCodes,
  resolvePromoVdaScope,
} from "@/lib/promo/promo-vda-scope";

// อ่านจาก directory ที่ reload ตาม mtime ของ CSV — cache ไว้จะเห็นข้อมูลเก่าหลัง sync
export const dynamic = "force-dynamic";

/**
 * โปร C4 ของเดือนปัจจุบัน แยกตามคลัง VDA
 *
 * `?vdaCode=vda2` = เฉพาะคลังนั้น · ไม่ส่ง หรือ `all` = ทุกคลังที่มีสิทธิ์ดู
 *
 * แอดมินเลือกได้ทุกคลัง · เซลล์เลือกได้เฉพาะคลังที่ตัวเองดูแล — ขอคลังนอกสิทธิ์
 * ได้ 403 ไม่ใช่รายการว่าง เพื่อไม่ให้เข้าใจผิดว่า "คลังนั้นไม่มีโปร"
 *
 * เดือนปัจจุบันอย่างเดียว: ไฟล์ C4 ที่ sync มาถือข้อมูลเดือนที่ใช้อยู่เท่านั้น
 */
export async function GET(request: Request) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allStores = listStockFromDbSources();
  const scope = resolvePromoVdaScope(
    session,
    allStores,
    session.role === "admin" ? allStores : ownedVdaCodesForSession(session)
  );

  const requested = new URL(request.url).searchParams.get("vdaCode");
  const storeCodes = pickPromoStoreCodes(scope, requested);
  if (storeCodes === null) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิ์ดูโปรของคลังนี้" },
      { status: 403 }
    );
  }

  // ล็อกอินถูกต้องแต่ยังไม่มีคลังในความดูแล — ไม่ใช่ error ต้องอธิบายให้เข้าใจ
  if (storeCodes.length === 0) {
    return NextResponse.json({
      scope: scope.kind,
      availableVdas: [],
      selectedVda: null,
      report: null,
      reason: "no_vda",
    });
  }

  try {
    return NextResponse.json({
      scope: scope.kind,
      // ถึงตรงนี้ scope ไม่ใช่ "none" แล้ว (คืนไปข้างบนตั้งแต่ storeCodes ว่าง)
      availableVdas: scope.kind === "none" ? [] : scope.storeCodes,
      selectedVda: storeCodes.length === 1 ? storeCodes[0] : null,
      report: buildPromoMonthReport({ storeCodes }),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "PROMO_NOT_LOADED") {
      return NextResponse.json(
        { error: "ข้อมูลโปรโมชั่นยังไม่พร้อม — ต้อง sync ไฟล์โปรจาก Fabric ก่อน" },
        { status: 503 }
      );
    }
    throw err;
  }
}
