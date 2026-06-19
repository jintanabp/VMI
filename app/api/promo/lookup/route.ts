import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_STORE_CODE_COOKIE } from "@/lib/auth/roles";
import { lookupOrderPromoLines } from "@/lib/promo/lookup-order-lines";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const storeCode = cookieStore.get(CUSTOMER_STORE_CODE_COOKIE)?.value;
  if (!storeCode) {
    return NextResponse.json({ error: "ไม่พบ session" }, { status: 401 });
  }

  const body = await request.json();
  const lines = Array.isArray(body.lines) ? body.lines : [];

  try {
    const result = lookupOrderPromoLines(storeCode, lines);
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
