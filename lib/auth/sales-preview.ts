import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { SalesSession } from "./sales-session";

export const SALES_PREVIEW_COOKIE = "vmi_sales_preview";
export const SALES_PREVIEW_INFO_COOKIE = "vmi_sales_preview_info";

interface SalesPreviewPayload {
  asEmail: string;
  asCode: string;
  asName: string;
  divisionCode?: string;
  exp: number;
}

function getSecret() {
  return process.env.NEXTAUTH_SECRET ?? "vmi-dev-secret";
}

function signPreview(payload: SalesPreviewPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyPreviewToken(token: string | undefined): SalesPreviewPayload | null {
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
    ) as SalesPreviewPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSalesPreviewCookie(opts: {
  asEmail: string;
  asCode: string;
  asName: string;
  divisionCode?: string;
}) {
  const payload: SalesPreviewPayload = {
    ...opts,
    exp: Date.now() + 8 * 60 * 60 * 1000,
  };
  const cookieStore = await cookies();
  cookieStore.set(SALES_PREVIEW_COOKIE, signPreview(payload), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  cookieStore.set(
    SALES_PREVIEW_INFO_COOKIE,
    JSON.stringify({
      asEmail: opts.asEmail,
      asCode: opts.asCode,
      asName: opts.asName,
    }),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    }
  );
}

export async function clearSalesPreviewCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SALES_PREVIEW_COOKIE);
  cookieStore.delete(SALES_PREVIEW_INFO_COOKIE);
}

export async function getSalesPreview(): Promise<SalesPreviewPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SALES_PREVIEW_COOKIE)?.value;
  return verifyPreviewToken(token);
}

/** Overlay admin session with impersonated salesperson view. */
export function applySalesPreview(
  session: SalesSession,
  preview: SalesPreviewPayload | null
): SalesSession {
  if (!preview || session.role !== "admin") return session;

  return {
    ...session,
    role: "sales",
    email: preview.asEmail,
    salesmanCode: preview.asCode,
    salesmanName: preview.asName,
    divisionCode: preview.divisionCode,
    scopeEmails: [preview.asEmail.toLowerCase()],
    scopeSalesmanCodes: [preview.asCode],
  };
}
