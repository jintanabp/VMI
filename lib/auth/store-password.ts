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

// เกณฑ์ความยาวย้ายไป ./password-rules แล้ว (ฝั่งเบราว์เซอร์ import ไฟล์นี้ไม่ได้เพราะมี crypto)
// re-export ไว้ให้ที่เรียกเดิมไม่ต้องแก้ และจะได้ไม่มีใครเผลอเขียนเกณฑ์ขึ้นมาใหม่
export {
  PASSWORD_MIN_LEN,
  PASSWORD_MAX_LEN,
  validatePasswordStrength,
} from "./password-rules";
