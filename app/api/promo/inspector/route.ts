import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_STORE_CODE_COOKIE } from "@/lib/auth/roles";
import { getSalesSession } from "@/lib/auth/sales-session";
import {
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";
import { isVdaStoreCode } from "@/lib/fabric/vda-aos-bill";
import { buildPromoInspector } from "@/lib/promo/promo-inspector";

async function assertStoreAccess(storeCode: string) {
  const cookieStore = await cookies();
  const customerStore = cookieStore
    .get(CUSTOMER_STORE_CODE_COOKIE)
    ?.value?.toLowerCase();

  if (customerStore && customerStore === storeCode) {
    return null;
  }

  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && isVdaStoreCode(storeCode)) {
    const allowed = resolveVdaCodesForSalesmanCodes(
      resolveSalesmanCodesForFilter(session)
    );
    if (allowed.length > 0 && !allowed.includes(storeCode)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sku = searchParams.get("sku")?.trim();
  const group = searchParams.get("group")?.trim();
  let storeCode = searchParams.get("storeCode")?.trim().toLowerCase();

  if (!sku && !group) {
    return NextResponse.json(
      { error: "ระบุ sku หรือ group" },
      { status: 400 }
    );
  }

  if (!storeCode) {
    const cookieStore = await cookies();
    storeCode = cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value?.toLowerCase();
  }

  if (!storeCode) {
    return NextResponse.json({ error: "ไม่พบ store" }, { status: 400 });
  }

  const denied = await assertStoreAccess(storeCode);
  if (denied) return denied;

  const session = await getSalesSession();

  try {
    const result = buildPromoInspector({
      storeCode,
      sku: sku || undefined,
      group: group || undefined,
      salesRepEmail: session?.email,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "PROMO_NOT_LOADED") {
      return NextResponse.json(
        { error: "Promotion master not loaded" },
        { status: 503 }
      );
    }
    throw err;
  }
}
