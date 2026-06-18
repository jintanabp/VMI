import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { clearSalesPreviewCookie } from "@/lib/auth/sales-preview";

export async function POST() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await clearSalesPreviewCookie();
  return NextResponse.json({ success: true });
}
