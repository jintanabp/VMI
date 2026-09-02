import { describe, expect, it } from "vitest";
import { AZURE_AD_CLIENT_ID, AZURE_AD_TENANT_ID } from "@/lib/auth/azure-app";
import { getAzureIds } from "@/lib/auth/microsoft-oauth";

/**
 * ล็อกค่า App Registration ไว้ในโค้ด
 *
 * `NEXT_PUBLIC_*` ถูกฝังตอน build และ `.dockerignore` กัน `.env` ออกจาก build context
 * → image ที่ build ด้วย Docker เคยได้ค่าว่างฝั่งเบราว์เซอร์เสมอ แล้วปุ่ม Sign in
 * โยน "ยังไม่ได้ตั้ง NEXT_PUBLIC_AZURE_AD_CLIENT_ID" ทั้งที่ .env บน server ตั้งครบ
 * ถ้าใครย้ายค่าพวกนี้กลับไปพึ่ง env ล้วน ๆ เทสต์นี้ต้องแดง
 */
describe("Azure App Registration", () => {
  it("มีค่า client id / tenant id ในโค้ด ไม่ต้องพึ่ง env", () => {
    const guid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
    expect(AZURE_AD_CLIENT_ID).toMatch(guid);
    expect(AZURE_AD_TENANT_ID).toMatch(guid);
  });

  it("ฝั่ง server ใช้ค่าเดียวกับฝั่งเบราว์เซอร์", () => {
    expect(getAzureIds()).toEqual({
      clientId: AZURE_AD_CLIENT_ID,
      tenantId: AZURE_AD_TENANT_ID,
    });
  });

  it("ไม่ throw เมื่อไม่ได้ตั้ง env — ไม่ตั้ง = ถูก", () => {
    expect(() => getAzureIds()).not.toThrow();
  });
});
