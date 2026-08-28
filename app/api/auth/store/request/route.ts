import { NextResponse } from "next/server";
import {
  getStoreAccountByEmail,
  requestStoreAccount,
} from "@/lib/auth/store-account";
import {
  checkRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/auth/rate-limit";

/**
 * 5 ครั้ง/ชม./IP — route นี้ตอบต่างกันระหว่างอีเมลที่มีบัญชีกับไม่มี (ไล่เดาอีเมล
 * ในองค์กรได้) และยังสร้างแถว pending ให้คนนอกได้ไม่จำกัดถ้าไม่จำกัดจำนวน
 */
const REQUEST_RULE = { limit: 5, windowMs: 60 * 60 * 1000 };

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

  const limit = checkRateLimit(`store-request:${clientIp(request)}`, REQUEST_RULE);
  if (!limit.allowed) return tooManyRequests(limit);

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
