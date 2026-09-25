[← กลับหน้าแรก](./00-home.md)

# 03 — การยืนยันตัวตน

ระบบมี 3 เส้นทางล็อกอินที่แยกกันสิ้นเชิง แต่ละเส้นทางเก็บ cookie คนละตัว

| บทบาท | วิธีเข้า | Cookie | ไฟล์หลัก |
|---|---|---|---|
| ร้านค้า / คลัง VDA | อีเมล + password (`StoreAccount`) | store session (เซ็นแล้ว) | `lib/auth/store-session.ts`, `store-password.ts` |
| แอดมินเข้าดูร้าน | เลือกรหัส VDA — **ต้องมี sales session role=admin ก่อน** | `CUSTOMER_STORE_COOKIE` | `lib/auth/customer-session.ts` |
| เซลล์ / Admin | Microsoft Entra ID (OAuth) | `SALES_SESSION_COOKIE` | `lib/auth/microsoft-oauth.ts`, `sales-session.ts` |

## 1. เลือกรหัส VDA — เฉพาะแอดมิน (โหมดเข้าดูร้าน)

`POST /api/auth/customer/login` → ตั้ง cookie เก็บ `storeId`

**เดิมเส้นทางนี้ไม่มีการตรวจสอบสิทธิ์ใด ๆ** การส่งค่า `{vda: "vda1"}` เข้ามาจะได้รับ session
ของร้านค้าโดยสมบูรณ์ ซึ่งสามารถสั่งสินค้า แก้ไขราคา และยกเลิกคำสั่งซื้อได้
ประกอบกับ `GET /api/vda` เปิดให้เรียกดูรายชื่อ VDA ได้โดยไม่ต้องยืนยันตัวตน
เอกสารฉบับเดิมระบุว่าออกแบบไว้สำหรับเครื่อง kiosk ภายในคลัง ซึ่งไม่สอดคล้องกับระบบ
ที่เปิดให้เข้าถึงผ่าน hostname สาธารณะ

**ตั้งแต่วันที่ 28 สิงหาคม 2569 ต้องมี sales session ที่มี `role === "admin"` เท่านั้น**
ร้านค้าทุกแห่งเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (`StoreAccount`) โดยผู้ดูแลระบบเป็นผู้สร้างบัญชี
ให้จากหน้า `/admin/stores/accounts`

### ตัวตนของร้านค้ามาจาก session ที่ลงลายเซ็นแล้วเท่านั้น

`lib/auth/store-context.ts` → `getAuthorizedStore()` เป็นช่องทางเดียวที่ API ฝั่งร้านค้า
ใช้ระบุว่าเป็นร้านใด โดยรับเฉพาะ StoreSession ที่ลงลายเซ็น HMAC แล้ว
หรือผู้ดูแลระบบที่อยู่ในโหมดเข้าดูข้อมูลร้านค้า

**ห้ามอ่าน cookie `vmi_store_id` โดยตรงในโค้ดใหม่** เนื่องจากเป็นค่า cuid ที่ไม่ได้ลงลายเซ็น
คุณสมบัติ httpOnly ป้องกันการเข้าถึงจาก JavaScript ได้ แต่ไม่สามารถป้องกัน HTTP request
ที่ประกอบขึ้นเองได้ เดิมทั้งระบบใช้ค่านี้เป็นตัวระบุตัวตน ทำให้ผู้ที่กำหนด cookie เป็นรหัส
ของร้านอื่นสามารถเข้าถึงและแก้ไขข้อมูลของร้านนั้นได้ และ `GET /api/stock?storeId=`
สามารถเรียกใช้ได้โดยไม่ต้องมี session แต่อย่างใด

## 2. ร้านค้าที่มีบัญชี

ร้านที่ต้องการความปลอดภัยกว่าใช้ `StoreAccount` (มี password hash)

| ขั้นตอน | API |
|---|---|
| ขอเปิดบัญชี | `POST /api/auth/store/request` |
| ตั้งรหัสผ่าน | `POST /api/auth/store/set-password` |
| ล็อกอิน | `POST /api/auth/store/login` |
| ขอรีเซ็ตรหัส | `POST /api/auth/store/request-reset` |

## 3. เซลล์ / Admin — Microsoft Entra ID

ใช้ **authorization code + PKCE ฝั่งเบราว์เซอร์** (SPA flow) — `lib/auth/microsoft-oauth-client.ts`
เบราว์เซอร์เป็นคนแลก code เป็น token เอง แล้วส่ง **id_token ดิบ** มาให้เซิร์ฟเวอร์ตรวจลายเซ็นเอง
ก่อนออก session (เซิร์ฟเวอร์จึงต้องออกอินเทอร์เน็ตไป `login.microsoftonline.com` ได้ —
เส้นทางเดียวกับที่ใช้ sync Fabric)

```mermaid
sequenceDiagram
    participant U as ผู้ใช้
    participant B as เบราว์เซอร์ (แอป)
    participant M as Microsoft
    participant S as เซิร์ฟเวอร์
    U->>B: กด "เข้าสู่ระบบด้วย Microsoft"
    B->>M: /authorize (PKCE)
    M->>U: หน้า login ขององค์กร
    M->>B: redirect กลับ /vmi/auth/callback?code=...
    B->>M: แลก code เป็น token (ในเบราว์เซอร์)
    B->>S: POST /api/auth/msal/session { idToken }
    S->>M: ดึงกุญแจสาธารณะ (JWKS) มาตรวจลายเซ็น + iss/aud/tid/exp
    S->>S: buildSalesSessionWithAccess() → หา role/scope จาก master
    S->>U: ตั้ง cookie ที่เซ็นแล้ว → เข้าหน้า /sales
```

> **ตัวตนพิสูจน์ที่เซิร์ฟเวอร์:** `POST /api/auth/msal/session` รับ `{ idToken }` แล้วตรวจ
> ลายเซ็น RS256 กับกุญแจสาธารณะของ tenant (JWKS · cache 24 ชม. · โหลดใหม่เมื่อเจอ kid
> ที่ไม่รู้จัก) พร้อมเช็ค `iss` / `aud` / `tid` / `exp` ก่อนเชื่อว่าอีเมลในนั้นเป็นของจริง —
> `lib/auth/microsoft-id-token.ts` เทสต์ที่ `tests/microsoft-id-token.test.ts`
>
> เดิมรับ `{ email }` มาตรง ๆ แล้วเซ็น cookie ให้เลย ใครยิง API ถึงและรู้อีเมลที่อยู่ใน
> `ADMIN_EMAILS` ก็เป็นแอดมินได้โดยไม่ต้องผ่าน Microsoft (middleware กันแต่หน้าเว็บ)
>
> `lib/auth/microsoft-oauth.ts` (server-side flow เดิม) และ route `/api/auth/microsoft/*`
> ยังไม่มีใครเรียก แต่ปลอดภัยอยู่แล้วเพราะแลก code ฝั่งเซิร์ฟเวอร์เอง

### session token
`lib/auth/sales-session.ts` เซ็น payload ด้วย HMAC-SHA256 โดยใช้ `NEXTAUTH_SECRET`
อายุ 7 วัน · ตอน verify จะประกอบ object กลับ**ทีละฟิลด์** ไม่ spread
เพื่อไม่ให้ฟิลด์แปลกปลอมใน token หลุดเข้ามาเป็นสิทธิ์

### บทบาทถูกคำนวณ ไม่ได้เก็บไว้
`buildSalesSessionWithAccess()` ดูจาก master `cross_salesman_reference_email`:

- มีลูกทีมที่ระบุ `managerCode` เป็นเรา → **manager**
- มีลูกทีมที่ระบุ `superCode` เป็นเรา → **supervisor**
- ไม่มีลูกทีม → **sales**
- อีเมลอยู่ใน `ADMIN_EMAILS` → **admin** (ข้ามทุกเงื่อนไข)

manager/supervisor จะได้ `scopeSalesmanCodes` และ `scopeEmails` ของลูกทีมลึก 2 ชั้น

### แอดมินกำหนดรหัสเซลล์ให้อีเมลเอง (ทับการจับคู่อัตโนมัติ)

ก่อนดูตามลำดับข้างบน `buildSalesSessionWithAccess()` เรียก `getManualSalesmanCodes(email)`
(`lib/auth/manual-salesman-assignments.ts`) ซึ่งอ่านตาราง `SalesmanEmailAssignment` (แก้ที่
`/admin/system/vda-sales`)

- มีแถว `active` อย่างน้อย 1 แถว → ใช้รหัสพวกนั้น**แทน**ผลอัตโนมัติจาก cross_target ทั้งหมด และใส่ทุกรหัสลง
  `scopeSalesmanCodes` ตรงๆ (รหัสที่ไม่ได้เป็นหัวหน้า/ลูกทีมกันก็ไม่หาย)
- ไม่มีแถว → พฤติกรรมเดิมทุกประการ
- รหัสที่กำหนดไม่อยู่ใน master `cross_salesman` → **ยัง login ได้** (อีเมลอ้างอิง — ผู้ใช้ตัดสิน 25 ก.ย. 2569)
  เป็น role `sales` เห็นเฉพาะรหัสที่กำหนด (ไม่มีข้อมูลหัวหน้า/ลูกทีมใน master) · หน้า `/admin/system/vda-sales`
  ใช้อีเมลเหล่านี้เป็นเจ้าของรหัสด้วย (`buildVdaSalesDirectory(manual)`)
- **มีผลทันที:** `getRawSalesSession()` เทียบรหัสที่กำหนดตอนนี้กับ `session.manualCodes` ที่ติดมาใน cookie
  (query เดียวต่อ request) ต่างกัน → คำนวณสิทธิ์ใหม่ด้วย `buildSalesSessionWithAccess` สำหรับ request นั้น ·
  คำนวณไม่ได้แล้ว (ไม่เหลือรหัสใน master) → คืน `null` ผู้ใช้ถูกพาไป login · DB อ่านไม่ได้ชั่วคราว → ใช้ session เดิม
  (ไม่เขียน cookie ใหม่ตรงนั้นเพราะห้ามแก้ cookie ระหว่าง render — จึงคำนวณซ้ำทุก request จน login ใหม่)
  เทส: `tests/sales-session-revalidate.test.ts`
- **แทนที่ ไม่ใช่เพิ่ม:** ทุกจุดที่ดึง "รหัสทั้งหมดของคนนี้" (`getPersonSalesCodes` → ปุ่มดูทุก VDA ของฉัน,
  ตัวสลับรหัส, `assertOrderAccess`, หน้า PO, แจ้งเตือน, ขอบเขตโปร) ส่ง `session.manualCodes` ไปด้วย
  มีค่า = ใช้เฉพาะรหัสที่แอดมินกำหนด · สลับรหัส (`/api/sales/active-code`) ได้เฉพาะในชุดนี้
- แอดมินที่มี `salesmanCode` จะถูกพาไป `/sales` จาก `/` (ดู `app/page.tsx`) แอดมินล้วนไป `/admin` ตามเดิม

## สิทธิ์เข้าถึงออเดอร์

อยู่ที่ `lib/orders/access.ts` — `assertOrderAccess(orderId, session)`

1. admin ผ่านหมด
2. ถ้าร้านเป็น VDA → เช็คจากทะเบียนที่จับคู่จาก `cross_target_current_month` ว่ารหัสเซลล์ของเราดูแล VDA นั้นไหม
3. ถ้าไม่ใช่ VDA → เช็คว่า `store.salesRep.email` อยู่ใน scope ของเราไหม

> สิทธิ์มาจาก **master ของ Fabric** ไม่ใช่ตารางใน DB — ย้ายเขตที่ต้นทางแล้วสิทธิ์ตามทันทีโดยไม่ต้อง sync

## โหมดทดสอบของ Admin

Admin ดูระบบในมุมของคนอื่นได้โดยไม่ต้องรู้รหัสผ่านใคร

| อะไร | API | ผลลัพธ์ |
|---|---|---|
| ดูเป็นเซลล์คนอื่น | `POST /api/auth/admin/preview-sales` | มีแบนเนอร์เตือนบนหัวจอ |
| ออกจากโหมดเซลล์ | `POST /api/auth/admin/exit-sales-preview` | |
| ออกจากโหมด VDA | `POST /api/auth/admin/exit-preview` | |

## ตั้งค่า Azure Portal

Redirect URI ต้องตรงกับค่าที่ระบบใช้งานจริง คือ **มี basePath `/vmi` และลงท้ายด้วย
`/auth/callback`** (ไม่ใช่ `/auth/microsoft/callback` ซึ่งเป็น route เดิมที่คงไว้สำหรับ redirect เท่านั้น)

```
https://<โดเมน>/vmi/auth/callback
http://localhost:3000/vmi/auth/callback   ← สำหรับ dev
```

ลงทะเบียนภายใต้ประเภท **Single-page application (SPA)** ไม่ใช่ Web และห้ามมีเครื่องหมาย
`/` ปิดท้าย

ค่าที่ระบบใช้จริงมาจาก `getMicrosoftCallbackPath()` ใน `lib/auth/microsoft-oauth-client.ts`
หากมีการเปลี่ยนแปลง path ต้องแก้ไขทั้งใน Azure และค่า `NEXT_PUBLIC_AZURE_REDIRECT_URI`

env ที่ต้องมี: `NEXTAUTH_SECRET`, `ADMIN_EMAILS`

client id / tenant id **ไม่ได้อยู่ใน env** — อยู่ในโค้ดที่ `lib/auth/azure-app.ts`
เพราะเป็นตัวระบุสาธารณะ (ถูกส่งให้ทุกเบราว์เซอร์อยู่แล้ว) และเพราะ `NEXT_PUBLIC_*`
ตั้งบน server ไม่ได้ ดูหัวข้อถัดไป

> **`NEXTAUTH_SECRET` มีเงื่อนไขเพิ่มเติมนอกเหนือจากการมีค่า** ระบบ production
> จะ**ไม่เริ่มทำงาน** หากไม่ได้กำหนด สั้นกว่า 32 ตัวอักษร หรือยังเป็นค่าตัวอย่าง
> (`vmi-dev-secret`, `your-random-secret-here`) รายละเอียดที่ `lib/auth/session-secret.ts`
> การออกแบบให้หยุดทำงานทันทีเป็นไปเพื่อป้องกันกรณีที่ cookie ทุกใบสามารถถูกปลอมแปลงได้

> ⚠️ `NEXT_PUBLIC_*` ถูกฝังลง JS ตอน `next build` **และ `.dockerignore` กัน `.env`
> ออกจาก build context** — ตั้งใน `.env` บน server จึงไม่มีผลกับฝั่งเบราว์เซอร์เลย
> (เคยทำให้ปุ่ม Sign in เด้ง "ยังไม่ได้ตั้ง NEXT_PUBLIC_AZURE_AD_CLIENT_ID" ทั้งที่
> ตัวแปรอยู่ครบใน `.env`) ค่าจึงย้ายไปอยู่ในโค้ดที่ `lib/auth/azure-app.ts` แล้ว
