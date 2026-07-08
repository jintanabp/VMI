import { NextResponse } from "next/server";
import {
  getStoreAccountByEmail,
  requestStoreAccount,
} from "@/lib/auth/store-account";

function stepFor(account: {
  status: string;
  mustSetPassword: boolean;
  passwordHash: string | null;
}): "pending" | "rejected" | "set-password" | "login" {
  if (account.status === "rejected") return "rejected";
  if (account.status !== "approved") return "pending";
  if (account.mustSetPassword || !account.passwordHash) return "set-password";
  return "login";
}

/** ร้านค้ากรอกอีเมล — ตรวจสถานะ / สร้างคำขอ pending ถ้ายังไม่มี */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const vdaCode = String(body.vdaCode ?? "").trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "กรุณากรอกอีเมลให้ถูกต้อง" }, { status: 400 });
  }

  let account = await getStoreAccountByEmail(email);
  if (!account) {
    if (!vdaCode) {
      return NextResponse.json(
        { error: "กรุณาเลือก VDA ของร้านค้า", needVda: true },
        { status: 400 }
      );
    }
    account = await requestStoreAccount(email, vdaCode);
    return NextResponse.json({
      status: "pending",
      step: "pending",
      message: "ส่งคำขอแล้ว — รอแอดมินยืนยันสิทธิ",
    });
  }

  return NextResponse.json({
    status: account.status,
    step: stepFor(account),
  });
}
