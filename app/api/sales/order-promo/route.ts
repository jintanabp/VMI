import { NextResponse } from "next/server";
import { z } from "zod";
import { getSalesSession } from "@/lib/auth/sales-session";
import {
  resolveSalesmanCodesForFilter,
  resolveVdaCodesForSalesmanCodes,
} from "@/lib/orders/access";
import { lookupOrderPromoLines } from "@/lib/promo/lookup-order-lines";
import { isVdaStoreCode } from "@/lib/fabric/vda-aos-bill";

const bodySchema = z.object({
  storeCode: z.string().min(1),
  lines: z
    .array(
      z.object({
        skuCode: z.string().min(1),
        qty: z.number().int().min(0),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const storeCode = parsed.data.storeCode.trim().toLowerCase();

  if (session.role !== "admin") {
    if (isVdaStoreCode(storeCode)) {
      const allowed = resolveVdaCodesForSalesmanCodes(
        resolveSalesmanCodesForFilter(session)
      );
      if (allowed.length > 0 && !allowed.includes(storeCode)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  try {
    const result = lookupOrderPromoLines(storeCode, parsed.data.lines, {
      salesRepEmail: session.email,
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
