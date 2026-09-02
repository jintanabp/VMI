import { createPublicKey, createVerify, type JsonWebKey } from "crypto";
import { AZURE_AD_CLIENT_ID, AZURE_AD_TENANT_ID } from "./azure-app";

/**
 * ตรวจ id_token จาก Microsoft ให้จบฝั่งเซิร์ฟเวอร์
 *
 * ## ทำไมต้องมี
 *
 * flow ของ SPA แลก token ที่เบราว์เซอร์ (Azure platform = Single-page application
 * บังคับแบบนั้น) แล้วเดิมส่งมาให้เซิร์ฟเวอร์แค่ **อีเมลที่แกะเอง** —
 * `POST /api/auth/msal/session {"email": "..."}` แล้วเซิร์ฟเวอร์เซ็น cookie ให้เลย
 * ใครยิง API ถึงและรู้อีเมลที่อยู่ใน ADMIN_EMAILS (อีเมลบริษัทธรรมดา) ก็ได้สิทธิ์
 * แอดมินเต็มโดยไม่ต้องผ่าน Microsoft สักขั้น — ปุ่ม Sign in เป็นแค่พิธีกรรม
 *
 * ที่นี่รับ id_token ตัวจริงมาตรวจลายเซ็นกับกุญแจสาธารณะของ Microsoft แล้วเอา
 * อีเมล "จากใน token ที่ตรวจแล้ว" เท่านั้น อีเมลที่ client ส่งมาเองไม่มีความหมายอีกต่อไป
 *
 * ## ทำไมไม่ใช้ไลบรารี
 *
 * Node 20 ทำได้ครบด้วย `crypto` ล้วน — `createPublicKey({format:"jwk"})` +
 * `createVerify("RSA-SHA256")` การเพิ่ม dependency ให้โค้ด 60 บรรทัดไม่คุ้มกับ
 * ผิวสัมผัสที่ต้องคอยตามอัปเดต
 *
 * @see app/api/auth/msal/session/route.ts (ผู้เรียก)
 * @see lib/auth/azure-app.ts (tenant / client id ที่ใช้ตรวจ)
 */

export interface MicrosoftJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

export interface VerifiedMicrosoftIdentity {
  email: string;
  name?: string;
  /** object id ของผู้ใช้ใน Entra — คงที่กว่าอีเมล เผื่อวันหนึ่งต้องผูกบัญชีด้วยตัวนี้ */
  oid?: string;
}

/** เผื่อนาฬิกาสองเครื่องไม่ตรงกัน — 5 นาทีเป็นค่าที่ Microsoft เองแนะนำ */
const CLOCK_SKEW_SEC = 5 * 60;

const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
const JWKS_TIMEOUT_MS = 5000;

function jwksUrl(): string {
  return `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/discovery/v2.0/keys`;
}

/** issuer ที่ token ของ tenant นี้ต้องประกาศ — v2.0 endpoint เท่านั้น */
export function expectedIssuer(): string {
  return `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/v2.0`;
}

let cache: { keys: MicrosoftJwk[]; fetchedAt: number } | null = null;

async function fetchJwks(): Promise<MicrosoftJwk[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JWKS_TIMEOUT_MS);
  try {
    const res = await fetch(jwksUrl(), { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`โหลดกุญแจของ Microsoft ไม่สำเร็จ (${res.status})`);
    }
    const body = (await res.json()) as { keys?: MicrosoftJwk[] };
    const keys = (body.keys ?? []).filter((k) => k.kty === "RSA" && k.kid);
    if (keys.length === 0) throw new Error("ไม่พบกุญแจ RSA จาก Microsoft");
    return keys;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * กุญแจสาธารณะของ tenant — cache ไว้ 24 ชม.
 *
 * `force` ใช้ตอนเจอ kid ที่ไม่รู้จัก: Microsoft หมุนกุญแจเป็นระยะ ถ้าไม่ยอมโหลดใหม่
 * ตอนนั้น ทุกคนจะ login ไม่ได้จนกว่า cache จะหมดอายุเอง (นานสุด 24 ชม.)
 */
async function getJwks(force = false): Promise<MicrosoftJwk[]> {
  const fresh = cache && Date.now() - cache.fetchedAt < JWKS_TTL_MS;
  if (!force && fresh) return cache!.keys;
  const keys = await fetchJwks();
  cache = { keys, fetchedAt: Date.now() };
  return keys;
}

function decodeSegment(segment: string): Record<string, unknown> {
  const json = Buffer.from(segment, "base64url").toString("utf-8");
  return JSON.parse(json) as Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * ตรวจ token กับชุดกุญแจที่ให้มา — แยกออกมาเป็น pure function เพื่อให้เทสต์ได้
 * โดยไม่ต้องต่อเน็ต (เทสต์สร้างคู่กุญแจของตัวเองแล้วเซ็น token เอง)
 */
export function verifyIdTokenWithKeys(
  idToken: string,
  keys: MicrosoftJwk[],
  opts?: { now?: Date; issuer?: string; audience?: string; tenantId?: string }
): VerifiedMicrosoftIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token ไม่ถูกต้อง");
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment(headerPart);
    payload = decodeSegment(payloadPart);
  } catch {
    throw new Error("id_token ไม่ถูกต้อง");
  }

  // alg ต้องมาจากที่เราคาด ไม่ใช่จากที่ token บอก — "alg: none" คือช่องโหว่คลาสสิก
  if (header.alg !== "RS256") {
    throw new Error("id_token ใช้อัลกอริทึมที่ไม่รองรับ");
  }
  const kid = str(header.kid);
  if (!kid) throw new Error("id_token ไม่มี kid");

  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("KEY_NOT_FOUND");

  const ok = createVerify("RSA-SHA256")
    .update(`${headerPart}.${payloadPart}`)
    .verify(
      createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" as const }),
      Buffer.from(signaturePart, "base64url")
    );
  if (!ok) throw new Error("ลายเซ็น id_token ไม่ถูกต้อง");

  const issuer = opts?.issuer ?? expectedIssuer();
  const audience = opts?.audience ?? AZURE_AD_CLIENT_ID;
  const tenantId = opts?.tenantId ?? AZURE_AD_TENANT_ID;

  if (str(payload.iss) !== issuer) {
    throw new Error("id_token มาจากผู้ออกที่ไม่ถูกต้อง");
  }
  if (str(payload.aud) !== audience) {
    throw new Error("id_token ไม่ได้ออกให้แอปนี้");
  }
  // tid กันเคส token จาก tenant อื่นที่ใช้ client id เดียวกัน (multi-tenant app)
  const tid = str(payload.tid);
  if (tid && tid !== tenantId) {
    throw new Error("id_token มาจากองค์กรอื่น");
  }

  const nowSec = Math.floor((opts?.now?.getTime() ?? Date.now()) / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : 0;
  if (!exp || nowSec > exp + CLOCK_SKEW_SEC) {
    throw new Error("id_token หมดอายุแล้ว — ลอง Sign in ใหม่");
  }
  if (nbf && nowSec + CLOCK_SKEW_SEC < nbf) {
    throw new Error("id_token ยังไม่ถึงเวลาใช้งาน");
  }

  const email =
    str(payload.preferred_username) ?? str(payload.email) ?? str(payload.upn);
  if (!email) throw new Error("ไม่พบอีเมลใน id_token");

  return { email, name: str(payload.name), oid: str(payload.oid) };
}

/** ตรวจ id_token กับกุญแจจริงของ Microsoft — โหลดกุญแจใหม่หนึ่งครั้งเมื่อเจอ kid ที่ไม่รู้จัก */
export async function verifyMicrosoftIdToken(
  idToken: string
): Promise<VerifiedMicrosoftIdentity> {
  try {
    return verifyIdTokenWithKeys(idToken, await getJwks());
  } catch (err) {
    if (err instanceof Error && err.message === "KEY_NOT_FOUND") {
      return verifyIdTokenWithKeys(idToken, await getJwks(true));
    }
    throw err;
  }
}
