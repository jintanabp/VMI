/**
 * Azure App Registration ของ VMI (sales/admin login) — ค่าอยู่ในโค้ด ไม่ใช่ .env
 *
 * ## ทำไมต้องอยู่ในโค้ด
 *
 * ตัวแปร `NEXT_PUBLIC_*` ถูก **ฝังลงในไฟล์ JS ตอน `next build`** ไม่ใช่อ่านตอนรัน
 * แต่ `.dockerignore` กัน `.env` ออกจาก build context (ตั้งใจ — ไม่อยากให้ความลับ
 * ติดไปใน image) ดังนั้นใน image ที่ build จาก `docker/Dockerfile` ฝั่งเบราว์เซอร์
 * จะได้ค่าว่างเสมอ **ไม่ว่าจะตั้งอะไรใน .env บน server** เพราะ `env_file:` ใน
 * docker-compose มีผลกับ process ตอนรันเท่านั้น ไม่ย้อนไปแก้ JS ที่ build เสร็จแล้ว
 *
 * อาการคือกดปุ่ม "Sign in with Microsoft" แล้วเด้ง
 * `ยังไม่ได้ตั้ง NEXT_PUBLIC_AZURE_AD_CLIENT_ID` ทั้งที่ตัวแปรอยู่ครบใน .env
 *
 * ## ปลอดภัยไหม
 *
 * client id กับ tenant id ของ SPA เป็น **ตัวระบุสาธารณะ** ไม่ใช่ความลับ —
 * มันถูกส่งให้ทุกเบราว์เซอร์ที่เปิดหน้า login อยู่แล้ว (ดูได้จาก URL ที่เด้งไป
 * login.microsoftonline.com) สิ่งที่เป็นความลับคือ `AZURE_AD_CLIENT_SECRET`
 * ซึ่งอ่านฝั่ง server จาก env ตามเดิม ไม่เกี่ยวกับไฟล์นี้
 *
 * @see lib/auth/microsoft-oauth-client.ts (ฝั่งเบราว์เซอร์)
 * @see lib/auth/microsoft-oauth.ts (ฝั่ง server)
 */

/** App Registration "VMI" ใน tenant ของ SPC — ลงทะเบียน redirect URI ใต้ platform SPA */
const DEFAULT_CLIENT_ID = "346eeb26-270a-46ef-a69d-0ea304d4dde1";
const DEFAULT_TENANT_ID = "e442d6a7-a8dc-4ac8-880b-d272b11642e9";

/**
 * env ยังทับได้สำหรับเครื่องที่ใช้ App Registration คนละใบ
 *
 * ต้องตั้ง **ตอน build** เท่านั้น (`npm run build` ที่อ่าน .env ของเครื่องนั้น) —
 * ตั้งตอนรันจะมีผลเฉพาะโค้ดฝั่ง server ใช้ `||` ไม่ใช่ `??` เพราะ Next ฝังค่าว่าง
 * มาให้เมื่อไม่ได้ตั้ง ซึ่ง `??` จะไม่ถอยไปใช้ค่า default
 */
export const AZURE_AD_CLIENT_ID =
  process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID;

export const AZURE_AD_TENANT_ID =
  process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
