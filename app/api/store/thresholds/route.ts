import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getStoreSession } from "@/lib/auth/store-session";
import { CUSTOMER_STORE_COOKIE } from "@/lib/auth/roles";
import {
  applyThresholdPatch,
  listGroupThresholds,
} from "@/lib/stock/thresholds-service";

async function resolveStoreId(): Promise<{
  storeId: string | null;
  canManage: boolean;
}> {
  const session = await getStoreSession();
  if (session) {
    return { storeId: session.storeId, canManage: session.canManageMinMax };
  }
  // admin preview / legacy — ดูได้อย่างเดียว
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value ?? null;
  return { storeId, canManage: false };
}

export async function GET() {
  const { storeId, canManage } = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    canManage,
    groups: await listGroupThresholds(storeId),
  });
}

export async function PATCH(request: Request) {
  const { storeId, canManage } = await resolveStoreId();
  if (!storeId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canManage) {
    return NextResponse.json(
      { error: "ไม่มีสิทธิจัดการ min/max" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { status, body: payload } = await applyThresholdPatch(storeId, body);
  return NextResponse.json(payload, { status });
}
