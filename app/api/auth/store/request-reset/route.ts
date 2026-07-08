import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth/store-account";

/** ร้านค้าขอรีเซ็ตรหัส — บันทึกให้แอดมินเห็น (แอดมินรีเซ็ตให้ในหน้าแอดมิน) */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "กรุณากรอกอีเมลให้ถูกต้อง" }, { status: 400 });
  }

  await requestPasswordReset(email);
  // ตอบเหมือนกันเสมอเพื่อไม่เปิดเผยว่ามีบัญชีอยู่จริงหรือไม่
  return NextResponse.json({
    success: true,
    message: "ส่งคำขอรีเซ็ตรหัสแล้ว — โปรดติดต่อแอดมินเพื่อยืนยัน",
  });
}
