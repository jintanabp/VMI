/**
 * secret เดียวสำหรับเซ็น session cookie ทุกชนิด (sales / store / preview)
 *
 * production ต้อง fail ตอน boot ถ้า NEXTAUTH_SECRET หาย/เป็น placeholder —
 * ไม่งั้นทุก cookie ถูกเซ็นด้วยค่า dev ที่อยู่ใน repo สาธารณะ = ปลอม admin ได้
 * ห้าม validate ที่ module top-level: ตอน `next build` ไม่มี .env (compose
 * ฉีด env ตอน runtime เท่านั้น) — เรียกผ่าน getSessionSecret()/assertSessionSecret()
 */

const DEV_FALLBACK = "vmi-dev-secret";
const PLACEHOLDERS = new Set([DEV_FALLBACK, "your-random-secret-here"]);
const MIN_LENGTH = 32;

let warned = false;

function validateProductionSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error(
      "[VMI] NEXTAUTH_SECRET is not set. Refusing to start in production — " +
        "session cookies would be forgeable. Set a random secret (>= 32 chars) in .env"
    );
  }
  if (PLACEHOLDERS.has(secret)) {
    throw new Error(
      "[VMI] NEXTAUTH_SECRET is still the placeholder value. Refusing to start in production. " +
        "Generate a real secret, e.g. `openssl rand -base64 32`"
    );
  }
  if (secret.length < MIN_LENGTH) {
    throw new Error(
      `[VMI] NEXTAUTH_SECRET is shorter than ${MIN_LENGTH} chars. Refusing to start in production. ` +
        "Generate a real secret, e.g. `openssl rand -base64 32`"
    );
  }
  return secret;
}

export function getSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    return validateProductionSecret(secret);
  }
  if (!secret || PLACEHOLDERS.has(secret)) {
    if (!warned) {
      warned = true;
      console.warn(
        "[VMI] NEXTAUTH_SECRET missing/placeholder — using dev fallback (dev only)"
      );
    }
    return DEV_FALLBACK;
  }
  return secret;
}

/** เรียกต้น boot (instrumentation.register) ให้ container ตายทันที ไม่ใช่ตอน login แรก */
export function assertSessionSecret(): void {
  getSessionSecret();
}
