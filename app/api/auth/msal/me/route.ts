import { NextResponse } from "next/server";
import { getSalesSession } from "@/lib/auth/sales-session";

export async function GET() {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}
