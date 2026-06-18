import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  CUSTOMER_STORE_COOKIE,
  CUSTOMER_STORE_CODE_COOKIE,
} from "@/lib/auth/roles";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_STORE_COOKIE);
  cookieStore.delete(CUSTOMER_STORE_CODE_COOKIE);
  return NextResponse.json({ success: true });
}
