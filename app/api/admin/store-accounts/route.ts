import { NextResponse } from "next/server";
import { getSalesSession } from "@/lib/auth/sales-session";
import {
  listStoreAccounts,
  approveStoreAccount,
  rejectStoreAccount,
  setStoreAccountVda,
  setCanManageMinMax,
  adminResetPassword,
  deleteStoreAccount,
  createStoreAccountByAdmin,
  changeStoreAccountEmail,
} from "@/lib/auth/store-account";

async function requireAdmin() {
  const session = await getSalesSession();
  if (session?.role !== "admin") return null;
  return session;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const accounts = await listStoreAccounts();
  return NextResponse.json({ accounts });
}

/** แอดมินเพิ่มบัญชีร้านค้าเอง — อนุมัติทันที ร้านตั้งรหัสผ่านเองครั้งแรกที่เข้าระบบ */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "ต้องระบุอีเมล" }, { status: 400 });
  }

  try {
    const account = await createStoreAccountByAdmin({
      email,
      vdaCode: String(body.vdaCode ?? ""),
      approvedBy: admin.email,
      canManageMinMax: !!body.canManageMinMax,
    });
    return NextResponse.json({ success: true, account });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "เพิ่มบัญชีไม่สำเร็จ" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const action = String(body.action ?? "");
  if (!email) {
    return NextResponse.json({ error: "ต้องระบุอีเมล" }, { status: 400 });
  }

  try {
    switch (action) {
      case "approve": {
        if (body.vdaCode) {
          await setStoreAccountVda(email, String(body.vdaCode));
        }
        const row = await approveStoreAccount(email, admin.email);
        return NextResponse.json({ success: true, account: row });
      }
      case "reject": {
        const row = await rejectStoreAccount(email, admin.email);
        return NextResponse.json({ success: true, account: row });
      }
      case "set-vda": {
        const row = await setStoreAccountVda(email, String(body.vdaCode ?? ""));
        return NextResponse.json({ success: true, account: row });
      }
      case "set-can-manage": {
        const row = await setCanManageMinMax(email, !!body.canManageMinMax);
        return NextResponse.json({ success: true, account: row });
      }
      case "reset-password": {
        const row = await adminResetPassword(email);
        return NextResponse.json({ success: true, account: row });
      }
      case "set-email": {
        const row = await changeStoreAccountEmail(
          email,
          String(body.newEmail ?? "")
        );
        return NextResponse.json({ success: true, account: row });
      }
      default:
        return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "ต้องระบุอีเมล" }, { status: 400 });
  }
  const ok = await deleteStoreAccount(email);
  return NextResponse.json({ success: ok });
}
