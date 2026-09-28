import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SALES_SESSION_COOKIE, type UserRole } from "./roles";
import { isAdminEmailAsync, isCreatorEmail } from "./admin-registry";
import type { AdminAccess } from "./permissions";
import { getSessionSecret } from "./session-secret";
import { applySalesPreview, getSalesPreview } from "./sales-preview";
import { pickPrimaryCode, salesCodeLabel } from "@/lib/admin/vda-sales-directory";
import { getManualSalesmanCodes } from "./manual-salesman-assignments";

export interface SalesSession {
  email: string;
  name?: string;
  role: Extract<UserRole, "sales" | "supervisor" | "manager" | "admin">;
  salesmanCode?: string;
  salesmanName?: string;
  employeeNo?: string;
  divisionCode?: string;
  superCode?: string;
  managerCode?: string;
  scopeSalesmanCodes?: string[];
  scopeEmails?: string[];
  /**
   * รหัสที่แอดมินกำหนดให้อีเมลนี้ ณ ตอนออก session (เรียงแล้ว) — ใช้ตรวจว่าแอดมินแก้ไปแล้วหรือยัง
   * ถ้าไม่ตรงกับในตารางตอนนี้ ระบบคำนวณสิทธิ์ใหม่ทันที ไม่รอให้ login ใหม่ (ดู getRawSalesSession)
   */
  manualCodes?: string[];
  /**
   * สิทธิ์หน้าตั้งค่า — "creator" คู่กับ role "admin" เสมอ · "admin" = แอดมินที่ creator เพิ่ม
   * ซึ่ง role เป็นของเซลล์ตามปกติ · ไม่มี = ไม่มีสิทธิ์หน้าตั้งค่า (ดู lib/auth/permissions.ts)
   */
  adminAccess?: AdminAccess;
  /**
   * มีค่า = creator กำลังอยู่ในมุมมองทดสอบเซลล์ (อีเมลจริงของ creator) — ใส่โดย applySalesPreview เท่านั้น
   * ไม่เคยอยู่ใน cookie ที่เซ็น (verifySalesSessionToken ไม่อ่านฟิลด์นี้) จึงปลอมไม่ได้
   * route ที่เขียนข้อมูลต้องปฏิเสธเมื่อมีค่านี้ — ดู `salesPreviewReadOnly()`
   */
  previewBy?: string;
}

/**
 * มุมมองทดสอบเซลล์ = ดูได้อย่างเดียว · คืน 403 เมื่อกำลังทดสอบ, null เมื่อเขียนได้
 *
 * เดิมเขียนได้ทุกอย่าง และบันทึกเป็นอีเมลของเซลล์ที่ถูกทดสอบ (หรือ `__code_preview__:SXXX`) —
 * อนุมัติ/ปฏิเสธ/แก้ราคา/ลบ/ส่ง ERP ในโหมดทดสอบจึงดูเหมือนเซลล์คนนั้นทำเอง (QA 28 ก.ย. 69)
 */
export function salesPreviewReadOnly(session: SalesSession | null): Response | null {
  if (!session?.previewBy) return null;
  return Response.json(
    {
      error:
        "มุมมองทดสอบดูได้อย่างเดียว — ออกจากมุมมองเซลล์ก่อน แล้วค่อยแก้ไขในบัญชีของคุณเอง",
    },
    { status: 403 }
  );
}

interface SessionPayload extends SalesSession {
  exp: number;
}

const getSecret = getSessionSecret;

export function signSalesSession(session: SalesSession): string {
  const payload: SessionPayload = {
    ...session,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySalesSessionToken(
  token: string | undefined
): SalesSession | null {
  if (!token) return null;

  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  const expected = createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    ) as SessionPayload;

    if (payload.exp < Date.now()) return null;

    // ประกอบกลับทีละฟิลด์ (ไม่ spread) เพื่อไม่ให้ `exp` หรือฟิลด์แปลกปลอมใน token
    // หลุดเข้ามาใน session — แต่ต้องครบทุกฟิลด์ของ SalesSession ไม่งั้นสิทธิ์หาย
    // เดิมตก superCode/managerCode/scope* ทำให้ manager/supervisor เห็นแต่ออเดอร์ตัวเอง
    return {
      email: payload.email,
      name: payload.name,
      role: payload.role,
      salesmanCode: payload.salesmanCode,
      salesmanName: payload.salesmanName,
      employeeNo: payload.employeeNo,
      divisionCode: payload.divisionCode,
      superCode: payload.superCode,
      managerCode: payload.managerCode,
      scopeSalesmanCodes: payload.scopeSalesmanCodes,
      scopeEmails: payload.scopeEmails,
      manualCodes: payload.manualCodes,
      adminAccess: payload.adminAccess,
    };
  } catch {
    return null;
  }
}

/** ระดับสิทธิ์หน้าตั้งค่าของอีเมลนี้ ณ ตอนนี้ — .env ชนะ DB เสมอ */
export async function resolveAdminAccess(email: string): Promise<AdminAccess | undefined> {
  if (isCreatorEmail(email)) return "creator";
  return (await isAdminEmailAsync(email)) ? "admin" : undefined;
}

/**
 * Access control (ตั้งแต่ 28 ก.ย. 2569 — ไม่ใช้ cross_salesman master แล้ว):
 * - รหัสเซลล์ของอีเมล = ที่ผูกไว้ในตาราง SalesmanEmailAssignment (หน้า «สิทธิ์เซลล์-VDA») เท่านั้น
 *   ไม่ได้ผูก = login ไม่ได้ (ยกเว้นผู้ดูแลระบบ ที่เข้าได้แต่หน้าตั้งค่า)
 * - ผูกหลายรหัส = เห็นทุกรหัสที่ผูก (ใช้แทนสายหัวหน้า/ลูกทีมเดิมที่มาจาก master) · role เป็น "sales" เสมอ
 * - สิทธิ์ดูออเดอร์ VDA มาจากทะเบียน VDA (cross_target / VDA_SALESMAN_MAP)
 * - Creator (.env) ได้ role "admin" · admin ใน DB ได้ role "sales" + `adminAccess: "admin"`
 */
export async function buildSalesSessionWithAccess(
  email: string,
  name?: string
): Promise<SalesSession> {
  const adminAccess = await resolveAdminAccess(email);
  const session = await buildSalesSessionForAccess(email, name, adminAccess);
  return adminAccess === "admin" ? { ...session, adminAccess } : session;
}

async function buildSalesSessionForAccess(
  email: string,
  name: string | undefined,
  adminAccess: AdminAccess | undefined
): Promise<SalesSession> {
  const linkedCodes = [...(await getManualSalesmanCodes(email))].sort();
  const primary = pickPrimaryCode(linkedCodes);

  if (adminAccess === "creator") {
    return {
      email,
      name: name || email,
      role: "admin",
      adminAccess: "creator",
      salesmanCode: primary,
      salesmanName: primary ? salesCodeLabel(primary) : undefined,
      scopeSalesmanCodes: linkedCodes.length > 0 ? linkedCodes : undefined,
      manualCodes: linkedCodes,
    };
  }

  if (!primary) {
    // admin ที่ไม่ได้เป็นเซลล์ — เข้าได้แต่หน้าตั้งค่า · role sales ขอบเขตว่าง = ไม่เห็นออเดอร์ใครเลย
    // (หน้า /sales ถูกกันที่ app/sales/layout.tsx ด้วย hasSalesView)
    if (adminAccess === "admin") {
      return {
        email,
        name: name || email,
        role: "sales",
        scopeSalesmanCodes: [],
        scopeEmails: [email.toLowerCase()],
        manualCodes: [],
      };
    }
    throw new Error(
      "อีเมลนี้ยังไม่ได้ผูกกับรหัสเซลล์ — ให้แอดมินเพิ่มอีเมลที่แท็บ «สิทธิ์เซลล์-VDA» ก่อน"
    );
  }

  return {
    email,
    name: name || email,
    role: "sales",
    salesmanCode: primary,
    salesmanName: salesCodeLabel(primary),
    scopeSalesmanCodes: linkedCodes,
    scopeEmails: [email.toLowerCase()],
    manualCodes: linkedCodes,
  };
}

/**
 * อ่านอย่างเดียว — **ห้ามลบ cookie ที่นี่** (เหตุผลเดียวกับ getStoreSession)
 * การแก้ cookie ระหว่าง render ทำให้ Next.js โยน error แล้วทุกหน้าขึ้น 500
 * แทนที่ผู้ใช้จะถูกพาไปหน้า login ตามปกติ
 */
export async function getRawSalesSession(): Promise<SalesSession | null> {
  const cookieStore = await cookies();
  const session = verifySalesSessionToken(cookieStore.get(SALES_SESSION_COOKIE)?.value);
  if (!session) return null;
  return revalidateManualCodes(session);
}

/**
 * สิทธิ์ถูกคำนวณครั้งเดียวตอน login แล้วแช่ใน cookie 7 วัน — แอดมินเอาอีเมลออกจากรหัสเซลล์
 * แล้วคนที่ login ค้างอยู่ยังเห็นออเดอร์ของรหัสนั้นต่อได้ทั้งสัปดาห์ (พบจาก review 25 ก.ย. 69)
 *
 * เทียบรหัสที่แอดมินกำหนดตอนนี้กับที่ติดมาใน session (query เดียว มี index ที่ email) —
 * ตรงกัน = ใช้ session เดิม · ไม่ตรง = คำนวณสิทธิ์ใหม่สำหรับ request นี้ · คำนวณไม่ได้แล้ว
 * (ไม่เหลือรหัสที่ผูกกับอีเมล) = ถือว่าไม่มี session ผู้ใช้จะถูกพาไปหน้า login
 *
 * ไม่เขียน cookie ใหม่ตรงนี้ (ห้ามแก้ cookie ระหว่าง render — ดูคอมเมนต์ด้านบน) จึงคำนวณซ้ำทุก
 * request จนกว่าจะ login ใหม่ ซึ่งเบา (query ตาราง SalesmanEmailAssignment ที่มี index)
 */
export async function revalidateManualCodes(session: SalesSession): Promise<SalesSession | null> {
  let current: string[];
  let access: AdminAccess | undefined;
  try {
    current = [...(await getManualSalesmanCodes(session.email))].sort();
    access = await resolveAdminAccess(session.email);
  } catch {
    // DB อ่านไม่ได้ชั่วคราว — อย่าเตะทุกคนออก ใช้สิทธิ์เดิมไปก่อน
    return session;
  }
  const before = session.manualCodes ?? [];
  // ระดับแอดมินเปลี่ยน (creator เพิ่ม/ลบ admin หรือแก้ .env) ต้องมีผลทันทีเหมือนรหัสเซลล์ —
  // cookie ก่อนแยกระดับ (28 ก.ย. 69) ไม่มีช่องนี้ จะถูกคำนวณใหม่ตรงนี้เองในรอบแรก
  const sameAccess =
    access === session.adminAccess && (session.role === "admin") === (access === "creator");
  // cookie ที่ออกตอนยังจับคู่จาก master (ก่อน 28 ก.ย. 69) มีรหัสที่ไม่ได้ผูกกับอีเมล หรือเป็น
  // manager/supervisor — ต้องคำนวณใหม่ ไม่งั้นยังเห็นออเดอร์ตาม master ต่อได้จนกว่า cookie หมดอายุ
  // รวมถึงขอบเขตที่แช่ใน cookie ต้องไม่กว้างกว่ารหัสที่ผูกอยู่ตอนนี้ — cookie เก่าอาจมีรหัส/อีเมลของลูกทีม
  // จาก master ติดมา และ /api/sales/active-code เซ็น cookie ใหม่ต่ออายุได้เรื่อย ๆ (QA 28 ก.ย. 69)
  const activeCode = session.salesmanCode?.trim().toUpperCase();
  const me = session.email.trim().toLowerCase();
  const scopeCodes = (session.scopeSalesmanCodes ?? []).map((c) => c.trim().toUpperCase());
  const fromMaster =
    session.role === "manager" ||
    session.role === "supervisor" ||
    (activeCode != null && !current.includes(activeCode)) ||
    scopeCodes.some((c) => !current.includes(c)) ||
    (session.scopeEmails ?? []).some((e) => e.trim().toLowerCase() !== me);
  if (
    sameAccess &&
    !fromMaster &&
    current.length === before.length &&
    current.every((c, i) => c === before[i])
  ) {
    return session;
  }
  try {
    return await buildSalesSessionWithAccess(session.email, session.name);
  } catch {
    return null;
  }
}

export async function getSalesSession(): Promise<SalesSession | null> {
  const session = await getRawSalesSession();
  if (!session) return null;
  const preview = await getSalesPreview();
  return applySalesPreview(session, preview);
}
