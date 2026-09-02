import { createSign, generateKeyPairSync, type KeyObject } from "crypto";
import { describe, expect, it } from "vitest";
import { AZURE_AD_CLIENT_ID, AZURE_AD_TENANT_ID } from "@/lib/auth/azure-app";
import {
  expectedIssuer,
  verifyIdTokenWithKeys,
  type MicrosoftJwk,
} from "@/lib/auth/microsoft-id-token";

/**
 * ตัวตนของเซลล์/แอดมินต้องพิสูจน์ด้วยลายเซ็นของ Microsoft ไม่ใช่คำบอกเล่าของเบราว์เซอร์
 *
 * เดิม `/api/auth/msal/session` รับ `{email}` ตรง ๆ แล้วเซ็น cookie ให้ — รู้อีเมลที่อยู่ใน
 * ADMIN_EMAILS ก็เป็นแอดมินได้เลย เทสต์ชุดนี้ล็อกด่านที่มาแทน: ปลอมลายเซ็นไม่ผ่าน
 * เปลี่ยน payload ไม่ผ่าน ออกให้แอปอื่นไม่ผ่าน มาจาก tenant อื่นไม่ผ่าน หมดอายุไม่ผ่าน
 *
 * สร้างคู่กุญแจเองในเทสต์ จึงไม่ต้องต่อเน็ตและไม่ผูกกับกุญแจจริงที่ Microsoft หมุนเรื่อย ๆ
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const KID = "test-key-1";

function jwks(key: KeyObject = publicKey): MicrosoftJwk[] {
  const jwk = key.export({ format: "jwk" }) as {
    kty: string;
    n: string;
    e: string;
  };
  return [{ kid: KID, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" }];
}

const NOW = new Date("2026-09-02T10:00:00Z");

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function makeToken(
  payload: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
  signer: KeyObject = privateKey
): string {
  const nowSec = Math.floor(NOW.getTime() / 1000);
  const head = b64url({ alg: "RS256", kid: KID, typ: "JWT", ...header });
  const body = b64url({
    iss: expectedIssuer(),
    aud: AZURE_AD_CLIENT_ID,
    tid: AZURE_AD_TENANT_ID,
    exp: nowSec + 3600,
    nbf: nowSec - 60,
    preferred_username: "someone@sahapat.co.th",
    name: "คุณทดสอบ",
    oid: "00000000-1111-2222-3333-444444444444",
    ...payload,
  });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(signer);
  return `${head}.${body}.${sig.toString("base64url")}`;
}

describe("verifyIdTokenWithKeys", () => {
  it("token ที่ถูกต้องผ่าน และคืนอีเมลจากใน token", () => {
    const id = verifyIdTokenWithKeys(makeToken(), jwks(), { now: NOW });
    expect(id.email).toBe("someone@sahapat.co.th");
    expect(id.name).toBe("คุณทดสอบ");
    expect(id.oid).toBe("00000000-1111-2222-3333-444444444444");
  });

  it("อีเมลมาจาก upn / email ได้ถ้าไม่มี preferred_username", () => {
    expect(
      verifyIdTokenWithKeys(
        makeToken({ preferred_username: undefined, upn: "u@sahapat.co.th" }),
        jwks(),
        { now: NOW }
      ).email
    ).toBe("u@sahapat.co.th");
  });

  it("แก้ payload หลังเซ็น = ลายเซ็นไม่ผ่าน (ยกระดับตัวเองเป็นแอดมินไม่ได้)", () => {
    const token = makeToken();
    const [h, , s] = token.split(".");
    const forged = b64url({
      iss: expectedIssuer(),
      aud: AZURE_AD_CLIENT_ID,
      tid: AZURE_AD_TENANT_ID,
      exp: Math.floor(NOW.getTime() / 1000) + 3600,
      preferred_username: "admin@sahapat.co.th",
    });
    expect(() =>
      verifyIdTokenWithKeys(`${h}.${forged}.${s}`, jwks(), { now: NOW })
    ).toThrow(/ลายเซ็น/);
  });

  it("เซ็นด้วยกุญแจของตัวเอง = ไม่ผ่าน", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(() =>
      verifyIdTokenWithKeys(makeToken({}, {}, other.privateKey), jwks(), {
        now: NOW,
      })
    ).toThrow(/ลายเซ็น/);
  });

  it("alg: none หรืออัลกอริทึมอื่น = ไม่ผ่าน", () => {
    expect(() =>
      verifyIdTokenWithKeys(makeToken({}, { alg: "none" }), jwks(), { now: NOW })
    ).toThrow(/อัลกอริทึม/);
    expect(() =>
      verifyIdTokenWithKeys(makeToken({}, { alg: "HS256" }), jwks(), { now: NOW })
    ).toThrow(/อัลกอริทึม/);
  });

  it("ออกให้แอปอื่น (aud ไม่ตรง) = ไม่ผ่าน", () => {
    expect(() =>
      verifyIdTokenWithKeys(makeToken({ aud: "another-app" }), jwks(), {
        now: NOW,
      })
    ).toThrow(/ไม่ได้ออกให้แอปนี้/);
  });

  it("issuer ไม่ตรง = ไม่ผ่าน", () => {
    expect(() =>
      verifyIdTokenWithKeys(
        makeToken({ iss: "https://login.microsoftonline.com/evil/v2.0" }),
        jwks(),
        { now: NOW }
      )
    ).toThrow(/ผู้ออกที่ไม่ถูกต้อง/);
  });

  it("มาจาก tenant อื่น = ไม่ผ่าน", () => {
    expect(() =>
      verifyIdTokenWithKeys(makeToken({ tid: "00000000-0000-0000-0000-000000000000" }), jwks(), {
        now: NOW,
      })
    ).toThrow(/องค์กรอื่น/);
  });

  it("หมดอายุแล้ว = ไม่ผ่าน (เผื่อนาฬิกาคลาด 5 นาที)", () => {
    const nowSec = Math.floor(NOW.getTime() / 1000);
    expect(() =>
      verifyIdTokenWithKeys(makeToken({ exp: nowSec - 600 }), jwks(), { now: NOW })
    ).toThrow(/หมดอายุ/);
    // เพิ่งหมดอายุ 1 นาที — ยังอยู่ในช่วงเผื่อ ต้องผ่าน
    expect(
      verifyIdTokenWithKeys(makeToken({ exp: nowSec - 60 }), jwks(), { now: NOW })
        .email
    ).toBe("someone@sahapat.co.th");
  });

  it("kid ที่ไม่รู้จัก = บอกให้ผู้เรียกไปโหลดกุญแจใหม่", () => {
    expect(() =>
      verifyIdTokenWithKeys(makeToken({}, { kid: "rotated" }), jwks(), {
        now: NOW,
      })
    ).toThrow("KEY_NOT_FOUND");
  });

  it("ไม่ใช่ JWT / ไม่มีอีเมลใน token = ไม่ผ่าน", () => {
    expect(() => verifyIdTokenWithKeys("ไม่ใช่โทเคน", jwks(), { now: NOW })).toThrow(
      /ไม่ถูกต้อง/
    );
    expect(() =>
      verifyIdTokenWithKeys(
        makeToken({ preferred_username: undefined, email: undefined, upn: undefined }),
        jwks(),
        { now: NOW }
      )
    ).toThrow(/ไม่พบอีเมล/);
  });
});
