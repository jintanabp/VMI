import { NextResponse } from "next/server";
import { exitAdminPreview } from "@/lib/auth/admin-preview";
import { getSalesSession } from "@/lib/auth/sales-session";

export async function POST(request: Request) {
  const session = await getSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await exitAdminPreview();
  return NextResponse.redirect(new URL("/admin", request.url), 303);
}
