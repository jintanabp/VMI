import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
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
  toStoreAccountView,
} from "@/lib/auth/store-account";
import { can, isCreator, type AdminPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/admin/audit-log";

/**
 * creator ทำได้ทุก action · admin (lib/auth/permissions.ts) ได้แค่ ดูรออนุมัติ+อนุมัติแล้ว ·
 * อนุมัติคำขอที่รออยู่ · รีเซ็ตรหัส · เพิ่มบัญชีใหม่ — ลบ/ปฏิเสธ/แก้ VDA/แก้อีเมล/สิทธิ์ min-max
 * เป็นของ creator เท่านั้น
 */
async function requirePermission(permission: AdminPermission) {
  const session = await getRawSalesSession();
  if (!can(session, permission)) return null;
  return session;
}

function forbidden() {
  return NextResponse.json({ error: "ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });
}

export async function GET() {
  const admin = await requirePermission("stores.view");
  if (!admin) return forbidden();
  const accounts = await listStoreAccounts();
  return NextResponse.json({
    // ส่งแค่ View — แถวดิบมี passwordHash / setupCodeHash (เดิมหลุดไปถึงเบราว์เซอร์ — QA 28 ก.ย. 69)
    accounts: (isCreator(admin)
      ? accounts
      : accounts.filter((a) => a.status === "pending" || a.status === "approved")
    ).map((a) => toStoreAccountView(a)),
    // หน้าเว็บใช้ซ่อนปุ่มที่ทำไม่ได้ — ตัวตัดสินจริงคือการตรวจในแต่ละ handler
    canManageAll: isCreator(admin),
  });
}

/**
 * แอดมินเพิ่มบัญชีร้านค้าเอง — อนุมัติทันที ร้านตั้งรหัสผ่านเองครั้งแรกด้วยรหัสตั้งค่าที่แอดมินส่งให้
 * (ใช้ getRawSalesSession ทั้งไฟล์ — creator ที่อยู่ในมุมมองทดสอบเซลล์ต้องยังจัดการบัญชีได้)
 */
export async function POST(request: Request) {
  const admin = await requirePermission("stores.create");
  if (!admin) return forbidden();

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "ต้องระบุอีเมล" }, { status: 400 });
  }

  try {
    const { account, setupCode } = await createStoreAccountByAdmin({
      email,
      vdaCode: String(body.vdaCode ?? ""),
      approvedBy: admin.email,
      // สิทธิ์ min/max เป็นของ creator — admin เพิ่มบัญชีได้แต่ติ๊กให้ไม่ได้
      canManageMinMax: isCreator(admin) && !!body.canManageMinMax,
    });
    await recordAudit(admin, "store.create", email, {
      vdaCode: account.vdaCode ?? null,
      canManageMinMax: account.canManageMinMax,
    });
    // setupCode โชว์ครั้งเดียว — แอดมินต้องส่งต่อให้ร้านเอง (ระบบยังส่งอีเมลเองไม่ได้)
    return NextResponse.json({ success: true, account: toStoreAccountView(account), setupCode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "เพิ่มบัญชีไม่สำเร็จ" },
      { status: 400 }
    );
  }
}

/** action ที่ admin (ไม่ใช่ creator) ทำได้ — ที่ไม่อยู่ในนี้เป็นของ creator เท่านั้น */
const STAFF_ADMIN_ACTIONS: Record<string, AdminPermission> = {
  approve: "stores.approve",
  "reset-password": "stores.resetPassword",
};

export async function PATCH(request: Request) {
  const session = await getRawSalesSession();
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const action = String(body.action ?? "");

  const creator = isCreator(session);
  const staffPermission = STAFF_ADMIN_ACTIONS[action];
  if (!session || (!creator && !(staffPermission && can(session, staffPermission)))) {
    return forbidden();
  }
  const admin = session;
  if (!email) {
    return NextResponse.json({ error: "ต้องระบุอีเมล" }, { status: 400 });
  }

  if (!creator) {
    // admin เห็นแค่รออนุมัติ + อนุมัติแล้ว — ห้ามแตะบัญชีที่ถูกปฏิเสธ (ปุ่ม "อนุมัติใหม่" เป็นของ
    // creator) · อนุมัติได้เฉพาะคำขอที่ยังรออยู่ · รีเซ็ตรหัสได้เฉพาะบัญชีที่อนุมัติแล้ว
    const row = await prisma.storeAccount.findUnique({
      where: { email },
      select: { status: true },
    });
    const allowed =
      (action === "approve" && row?.status === "pending") ||
      (action === "reset-password" && row?.status === "approved");
    if (!allowed) return forbidden();
  }

  try {
    switch (action) {
      case "approve": {
        if (body.vdaCode) {
          await setStoreAccountVda(email, String(body.vdaCode));
        }
        const { account, setupCode } = await approveStoreAccount(email, admin.email);
        await recordAudit(admin, "store.approve", email, { vdaCode: account.vdaCode ?? null });
        return NextResponse.json({ success: true, account: toStoreAccountView(account), setupCode });
      }
      case "reject": {
        const row = await rejectStoreAccount(email, admin.email);
        await recordAudit(admin, "store.reject", email);
        return NextResponse.json({ success: true, account: toStoreAccountView(row) });
      }
      case "set-vda": {
        const row = await setStoreAccountVda(email, String(body.vdaCode ?? ""));
        await recordAudit(admin, "store.setVda", email, { vdaCode: row.vdaCode ?? null });
        return NextResponse.json({ success: true, account: toStoreAccountView(row) });
      }
      case "set-can-manage": {
        const row = await setCanManageMinMax(email, !!body.canManageMinMax);
        await recordAudit(admin, "store.setCanManage", email, {
          canManageMinMax: row.canManageMinMax,
        });
        return NextResponse.json({ success: true, account: toStoreAccountView(row) });
      }
      case "reset-password": {
        const { account, setupCode } = await adminResetPassword(email);
        // ห้ามจด setupCode — ใครอ่านตารางนี้ได้จะตั้งรหัสแทนร้านได้
        await recordAudit(admin, "store.resetPassword", email);
        return NextResponse.json({ success: true, account: toStoreAccountView(account), setupCode });
      }
      case "set-email": {
        const row = await changeStoreAccountEmail(
          email,
          String(body.newEmail ?? "")
        );
        await recordAudit(admin, "store.setEmail", email, { newEmail: row.email });
        return NextResponse.json({ success: true, account: toStoreAccountView(row) });
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
  const session = await getRawSalesSession();
  if (!isCreator(session)) return forbidden();
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "ต้องระบุอีเมล" }, { status: 400 });
  }
  const ok = await deleteStoreAccount(email);
  if (ok && session) await recordAudit(session, "store.delete", email);
  return NextResponse.json({ success: ok });
}
