import {
  ClientSecretCredential,
  DefaultAzureCredential,
  InteractiveBrowserCredential,
  type TokenCredential,
} from "@azure/identity";
import {
  getOnelakeAuthEnvForProfile,
  stockAuthEnvIsSet,
  type OnelakeAuthProfile,
} from "./env";

const TOKEN_RESOURCE = "https://storage.azure.com/.default";

export type OnelakeAuthMode =
  | "service_principal"
  | "interactive"
  | "default_credential";

/** Credential chain — mirrors ocr-po-matching/backend/master_refresh.py */
export function getOnelakeCredential(
  allowInteractive = false,
  profile: OnelakeAuthProfile = "masters"
): TokenCredential {
  const { tenantId, clientId, clientSecret } = getOnelakeAuthEnvForProfile(profile);
  const label = profile === "stock" ? "stock" : "masters";

  if (tenantId && clientId && clientSecret) {
    console.info(
      "[OneLake] auth (%s): service principal (client_id=%s)",
      label,
      clientId
    );
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  if (allowInteractive) {
    // InteractiveBrowserCredential เปิดเบราว์เซอร์ฝั่งเซิร์ฟเวอร์ — ใน Docker/บริการ
    // ที่ไม่มี TTY จะค้างจน reverse proxy timeout แทนที่จะแจ้งว่าตั้ง env ไม่ครบ
    // ให้ล้มเร็วพร้อมข้อความที่แก้ต่อได้ (CLI ที่มี TTY ยังใช้ได้ตามปกติ)
    if (!process.stdout.isTTY) {
      throw new Error(
        `OneLake (${label}): เข้าสู่ระบบแบบเปิดเบราว์เซอร์ใช้บนเซิร์ฟเวอร์ไม่ได้ — ` +
          "ต้องตั้ง client secret ของ service principal ใน env"
      );
    }
    console.info("[OneLake] auth (%s): InteractiveBrowserCredential", label);
    return new InteractiveBrowserCredential({
      tenantId: tenantId || undefined,
      clientId: clientId || undefined,
    });
  }

  const stubSecret = Boolean(tenantId && clientId && !clientSecret);
  console.info(
    "[OneLake] auth (%s): DefaultAzureCredential (stubSecret=%s)",
    label,
    stubSecret
  );
  return new DefaultAzureCredential();
}

export async function getOnelakeToken(
  allowInteractive = false,
  profile: OnelakeAuthProfile = "masters"
): Promise<string> {
  const cred = getOnelakeCredential(allowInteractive, profile);
  const token = await cred.getToken(TOKEN_RESOURCE);
  if (!token?.token) throw new Error("Failed to acquire OneLake token");
  return token.token;
}

/**
 * ใครกำลังยิงไป OneLake — เอาไว้ใส่ในข้อความ error ตอน 401/403
 *
 * "forbidden (403) — ตรวจสิทธิ์ SP" ตอบไม่ได้ว่า SP **ตัวไหน** ไม่มีสิทธิ์ **workspace ไหน**
 * ซึ่งเป็นคำถามเดียวที่ต้องรู้เพื่อแก้: ถ้า STOCK_ONELAKE_* ไม่ได้ตั้งบนเซิร์ฟเวอร์
 * profile "stock" จะถอยไปใช้ SP ของ masters เงียบ ๆ แล้วได้ 403 ที่ workspace Bronze
 * ทั้งที่ SP ของ stock มีสิทธิ์อยู่แล้ว (เกิดจริงบน production 26 ส.ค. 2026)
 *
 * client_id ไม่ใช่ความลับ (เป็น id ของ app registration) — ต่างจาก client secret
 * ที่ห้ามหลุดออกมาเด็ดขาด จึงเอามาแสดงบนหน้าแอดมินได้
 */
export function describeOnelakeIdentity(
  profile: OnelakeAuthProfile = "masters"
): {
  profile: OnelakeAuthProfile;
  clientId: string | null;
  mode: OnelakeAuthMode;
  /** profile นี้ถอยไปใช้ credential ของ masters เพราะ env ของตัวเองไม่ได้ตั้ง */
  fellBackToMasters: boolean;
} {
  const { tenantId, clientId, clientSecret } = getOnelakeAuthEnvForProfile(profile);
  return {
    profile,
    clientId: clientId || null,
    mode:
      tenantId && clientId && clientSecret
        ? "service_principal"
        : "default_credential",
    fellBackToMasters: profile === "stock" && !stockAuthEnvIsSet(),
  };
}

export function describeOnelakeAuthMode(
  allowInteractive = false,
  profile: OnelakeAuthProfile = "masters"
): OnelakeAuthMode {
  const { tenantId, clientId, clientSecret } = getOnelakeAuthEnvForProfile(profile);
  if (tenantId && clientId && clientSecret) return "service_principal";
  if (allowInteractive) return "interactive";
  return "default_credential";
}
