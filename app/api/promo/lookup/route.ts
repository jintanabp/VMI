import { NextResponse } from "next/server";
import { getAuthorizedStore } from "@/lib/auth/store-context";
import { lookupOrderPromoLines } from "@/lib/promo/lookup-order-lines";

export async function POST(request: Request) {
  const storeCode = (await getAuthorizedStore())?.storeCode;
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
