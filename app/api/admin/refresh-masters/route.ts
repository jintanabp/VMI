import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { isDatasetId } from "@/lib/fabric/datasets";
import { isRefreshRunning, runMasterRefreshNow } from "@/lib/fabric/scheduler";

const bodySchema = z.object({
  /** ว่าง/ไม่ส่ง = ดึงทุกชุดข้อมูล */
  datasets: z.array(z.string()).max(32).optional(),
});

export async function POST(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  }

  const requested = parsed.data.datasets ?? [];
  const unknown = requested.filter((id) => !isDatasetId(id));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `ไม่รู้จักชุดข้อมูล: ${unknown.join(", ")}` },
      { status: 400 }
    );
  }

  // กันกดซ้ำระหว่างรอบเดิมยังทำงาน — runMasterRefresh จะคืน promise เดิมให้
  // แต่ผู้กดควรรู้ว่ายังไม่จบ ไม่ใช่รอเงียบ ๆ แล้วคิดว่าตัวเองสั่งรอบใหม่
  if (isRefreshRunning()) {
    return NextResponse.json(
      { error: "refresh_in_progress", message: "มีรอบดึงข้อมูลกำลังทำงานอยู่" },
      { status: 409 }
    );
  }

  const outcome = await runMasterRefreshNow(
    requested.length > 0 ? requested : undefined
  );

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: outcome.error ?? "ดึงข้อมูลไม่สำเร็จ",
        datasets: outcome.datasets,
        ...outcome.result,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    durationMs: outcome.durationMs,
    datasets: outcome.datasets,
    ...outcome.result,
  });
}
