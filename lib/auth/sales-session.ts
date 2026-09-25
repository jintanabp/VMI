import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SALES_SESSION_COOKIE, isAdminEmail, type UserRole } from "./roles";
import { getSessionSecret } from "./session-secret";
import { getSalesmanRegistry } from "@/lib/fabric";
import { applySalesPreview, getSalesPreview } from "./sales-preview";
import {
  pickAssignmentForCodes,
  pickDefaultSalesmanAssignment,
} from "@/lib/admin/vda-sales-directory";
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
    };
  } catch {
    return null;
  }
}

export function buildSalesSession(email: string, name?: string): SalesSession {
  const registry = getSalesmanRegistry();
  const assignment =
    pickDefaultSalesmanAssignment(email) ?? registry.getCurrentByEmail(email);

  return {
    email,
    name: name || assignment?.nameThai || assignment?.nameEnglish,
    role: isAdminEmail(email) ? "admin" : "sales",
    salesmanCode: assignment?.code,
    salesmanName: assignment
      ? registry.getDisplayName(assignment)
      : undefined,
    employeeNo: assignment?.employeeNo,
    divisionCode: assignment?.divisionCode,
  };
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

/**
 * Access control:
 * - ต้องมีอีเมลใน cross_salesman master — หรือแอดมินกำหนดรหัสให้อีเมลนี้ไว้ (อีเมลอ้างอิง) ซึ่งใช้ได้
 *   แม้รหัสนั้นไม่มีใน cross_salesman
 * - สิทธิ์ดูออเดอร์ VDA มาจากทะเบียน VDA_SALESMAN_MAP (ไม่ใช้ allowlist)
 * - Manager/Supervisor ดูออเดอร์ VDA ของลูกทีม
 */
export async function buildSalesSessionWithAccess(
  email: string,
  name?: string
): Promise<SalesSession> {
  const registry = getSalesmanRegistry();
  // แอดมินกำหนดทับได้เสมอ — ถ้าอีเมลนี้มีแถว active ในตาราง SalesmanEmailAssignment
  // ใช้รหัสที่กำหนดไว้แทนผลอัตโนมัติจาก cross_target ทั้งหมด ไม่มีแถว = fallback แบบเดิม
  const manualCodes = await getManualSalesmanCodes(email);
  const assignment =
    manualCodes.length > 0
      ? pickAssignmentForCodes(manualCodes)
      : (pickDefaultSalesmanAssignment(email) ?? registry.getCurrentByEmail(email));

  if (isAdminEmail(email)) {
    return {
      email,
      name: name || assignment?.nameThai || assignment?.nameEnglish,
      role: "admin",
      salesmanCode: assignment?.code,
      salesmanName: assignment ? registry.getDisplayName(assignment) : undefined,
      employeeNo: assignment?.employeeNo,
      divisionCode: assignment?.divisionCode,
      superCode: assignment?.superCode,
      managerCode: assignment?.managerCode,
      scopeSalesmanCodes: manualCodes.length > 0 ? manualCodes : undefined,
      manualCodes: [...manualCodes].sort(),
    };
  }

  // แอดมินกำหนดรหัสไว้แต่รหัสนั้นไม่มีใน cross_salesman — ใช้ได้ (ผู้ใช้ตัดสิน 25 ก.ย. 69: ใช้อีเมลอ้างอิง
  // ที่แอดมินกำหนดแทนการพึ่ง cross_salesman) · ไม่มีข้อมูลหัวหน้า/ลูกทีม จึงเป็น role sales ที่เห็นเฉพาะ
  // รหัสที่กำหนด
  if (!assignment?.code && manualCodes.length > 0) {
    const code = manualCodes[0]!;
    return {
      email,
      name: name || email,
      role: "sales",
      salesmanCode: code,
      salesmanName: `รหัส ${code}`,
      scopeSalesmanCodes: [...manualCodes],
      scopeEmails: [email.toLowerCase()],
      manualCodes: [...manualCodes].sort(),
    };
  }

  if (!assignment?.code) {
    throw new Error(
      "ไม่พบข้อมูลพนักงานใน master (cross_salesman) และแอดมินยังไม่ได้กำหนดรหัสเซลล์ให้อีเมลนี้"
    );
  }

  const current = registry.listCurrentAssignments();
  const myCode = normalizeCode(assignment.code);

  const directs = current.filter(
    (a) =>
      normalizeCode(a.superCode || "") === myCode ||
      normalizeCode(a.managerCode || "") === myCode
  );
  const isManager = directs.some(
    (a) => normalizeCode(a.managerCode || "") === myCode
  );
  const isSupervisor = !isManager && directs.length > 0;
  const role: SalesSession["role"] = isManager
    ? "manager"
    : isSupervisor
      ? "supervisor"
      : "sales";

  const scope = new Set<string>();
  scope.add(myCode);
  let frontier = new Set<string>([myCode]);
  for (let depth = 0; depth < 2; depth++) {
    const next = new Set<string>();
    for (const a of current) {
      const c = normalizeCode(a.code);
      const sup = normalizeCode(a.superCode || "");
      const mgr = normalizeCode(a.managerCode || "");
      if (frontier.has(sup) || frontier.has(mgr)) {
        if (!scope.has(c)) {
          scope.add(c);
          next.add(c);
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  // แอดมินอาจกำหนดหลายรหัสให้อีเมลเดียว โดยรหัสอื่นไม่ได้เป็นหัวหน้า/ลูกทีมของ myCode
  // เลย ไม่โผล่จากการไล่ต้นไม้ด้านบน — ใส่เพิ่มตรง ๆ กันสิทธิ์หายไปเงียบ ๆ
  for (const c of manualCodes) scope.add(c);

  const scopeEmails = new Set<string>();
  scopeEmails.add(email.toLowerCase());
  for (const a of current) {
    if (scope.has(normalizeCode(a.code))) {
      scopeEmails.add(a.email.toLowerCase());
    }
  }

  return {
    email,
    name: name || assignment.nameThai || assignment.nameEnglish,
    role,
    salesmanCode: assignment.code,
    salesmanName: registry.getDisplayName(assignment),
    employeeNo: assignment.employeeNo,
    divisionCode: assignment.divisionCode,
    superCode: assignment.superCode,
    managerCode: assignment.managerCode,
    scopeSalesmanCodes: [...scope],
    scopeEmails: [...scopeEmails],
    manualCodes: [...manualCodes].sort(),
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
 * (ไม่มีรหัสเหลือใน master) = ถือว่าไม่มี session ผู้ใช้จะถูกพาไปหน้า login
 *
 * ไม่เขียน cookie ใหม่ตรงนี้ (ห้ามแก้ cookie ระหว่าง render — ดูคอมเมนต์ด้านบน) จึงคำนวณซ้ำทุก
 * request จนกว่าจะ login ใหม่ ซึ่งเบา (อ่าน master ใน memory)
 */
export async function revalidateManualCodes(session: SalesSession): Promise<SalesSession | null> {
  let current: string[];
  try {
    current = [...(await getManualSalesmanCodes(session.email))].sort();
  } catch {
    // DB อ่านไม่ได้ชั่วคราว — อย่าเตะทุกคนออก ใช้สิทธิ์เดิมไปก่อน
    return session;
  }
  const before = session.manualCodes ?? [];
  if (current.length === before.length && current.every((c, i) => c === before[i])) {
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
