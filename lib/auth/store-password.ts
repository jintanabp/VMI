import { randomBytes, scrypt, timingSafeEqual } from "crypto";

const KEYLEN = 64;
const PREFIX = "scrypt";

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/** สร้าง hash รูปแบบ `scrypt$<saltHex>$<hashHex>` (ไม่พึ่ง dependency ภายนอก) */
export async function hashStorePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt);
  return `${PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyStorePassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;

  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const derived = await scryptAsync(password, salt);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** ตรวจความแข็งแรงของรหัสขั้นต่ำ */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 6) {
    return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
  }
  if (password.length > 128) {
    return "รหัสผ่านยาวเกินไป";
  }
  return null;
}
