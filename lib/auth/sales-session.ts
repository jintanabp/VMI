import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SALES_SESSION_COOKIE, isAdminEmail, type UserRole } from "./roles";
import { getSalesmanRegistry } from "@/lib/fabric";
import { applySalesPreview, getSalesPreview } from "./sales-preview";
import { pickDefaultSalesmanAssignment } from "@/lib/admin/vda-sales-directory";

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
}

interface SessionPayload extends SalesSession {
  exp: number;
}

function getSecret() {
  return process.env.NEXTAUTH_SECRET ?? "vmi-dev-secret";
}

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

    return {
      email: payload.email,
      name: payload.name,
      role: payload.role,
      salesmanCode: payload.salesmanCode,
      salesmanName: payload.salesmanName,
      employeeNo: payload.employeeNo,
      divisionCode: payload.divisionCode,
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
 * - ต้องมีอีเมลใน cross_salesman master
 * - สิทธิ์ดูออเดอร์ VDA มาจาก vda_aos_bill (ไม่ใช้ allowlist)
 * - Manager/Supervisor ดูออเดอร์ VDA ของลูกทีม
 */
export async function buildSalesSessionWithAccess(
  email: string,
  name?: string
): Promise<SalesSession> {
  const registry = getSalesmanRegistry();
  const assignment =
    pickDefaultSalesmanAssignment(email) ?? registry.getCurrentByEmail(email);

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
    };
  }

  if (!assignment?.code) {
    throw new Error("ไม่พบข้อมูลพนักงานใน master (cross_salesman) — อีเมลนี้ยังไม่มีในระบบ");
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
  };
}

export async function getRawSalesSession(): Promise<SalesSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SALES_SESSION_COOKIE)?.value;
  const session = verifySalesSessionToken(token);
  if (token && !session) {
    cookieStore.delete(SALES_SESSION_COOKIE);
  }
  return session;
}

export async function getSalesSession(): Promise<SalesSession | null> {
  const session = await getRawSalesSession();
  if (!session) return null;
  const preview = await getSalesPreview();
  return applySalesPreview(session, preview);
}
