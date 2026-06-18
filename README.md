# VMI - Vendor Managed Inventory

เว็บแอปสำหรับจัดการสต็อกและคำสั่งซื้อระหว่างร้านค้า (ลูกค้า) กับเซลล์

## ฟีเจอร์หลัก

- **ร้านค้าทั้งหมด** — เลือกรหัสร้านค้า, ดูสต็อก, แก้ MIN/MAX, รับคำแนะนำการสั่ง, ส่งคำสั่งซื้อ
- **เซลล์** — เข้าด้วย Microsoft Azure AD, อนุมัติ/ปฏิเสธออเดอร์, ส่ง PO (stub)
- **Admin/Dev** — ทดสอบ flow ลูกค้าและเซลล์, debug panel

## Tech Stack

- Next.js 15 + TypeScript
- Tailwind CSS + shadcn-style components
- Prisma + SQLite (dev)
- MSAL (Microsoft Authentication Library) — Public Client ไม่ต้องใช้ Client Secret
- TanStack Query

## เริ่มต้นใช้งาน

```bash
# 1. ติดตั้ง dependencies
npm install

# 2. คัดลอก env
cp .env.example .env

# 3. สร้าง database และ seed ข้อมูลทดสอบ
npm run db:setup

# 4. รัน dev server (ต้องใช้ port 3000)
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

### ถ้า `npm run dev` ไม่ได้

| อาการ | วิธีแก้ |
|--------|--------|
| `Port 3000 ถูกใช้อยู่` | รัน `npm run dev:stop` แล้ว `npm run dev` อีกครั้ง |
| `ไม่พบ database` | รัน `npm run db:setup` |
| หน้าเปิดแต่ login Microsoft ไม่ได้ | ต้องรันที่ **port 3000** เท่านั้น (ไม่ใช่ 3001) |
| ตรวจสอบระบบ | เปิด `http://localhost:3000/api/health` ต้องได้ `{"ok":true}` |
| `Cannot find module './331.js'` หรือ chunk หาย | รัน `npm run clean` แล้ว `npm run dev` |

```bash
# หา process ที่ใช้ port 3000 (Windows)
netstat -ano | findstr :3000
```

## ทดสอบการใช้งาน

### ร้านค้าทั้งหมด (ไม่ต้องใช้ Azure)
1. หน้าแรก → **ร้านค้าทั้งหมด**
2. เลือกร้าน เช่น `ST001 - ร้านสมชาย การค้า`
3. ดูหน้าสต็อก → เลือกสินค้า → สั่งสินค้า

### เซลล์ (Azure AD — OAuth ฝั่ง Server)

ใช้ **Authorization Code Flow ฝั่ง server** — เสถียรกว่า MSAL redirect ใน browser

#### 1. ตั้งค่า `.env`

```env
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=<จาก Azure Portal>
NEXT_PUBLIC_AZURE_AD_TENANT_ID=<จาก Azure Portal>
NEXTAUTH_SECRET=<random string>
ADMIN_EMAILS=<อีเมลของคุณ>
```

**ถ้าใช้ platform Web (confidential client) เพิ่ม:**
```env
AZURE_AD_CLIENT_SECRET=<จาก Certificates & secrets>
AZURE_AD_USE_CLIENT_SECRET=true
```

**ถ้าใช้ platform SPA (public client)** — ไม่ต้องใส่ client secret (ใช้ PKCE อย่างเดียว)

#### 2. ตั้ง Redirect URI ใน Azure Portal (สำคัญมาก)

1. เปิด [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations**
2. เลือกแอป Client ID ของคุณ
3. **Authentication** → **Add a platform** → **Single-page application**
4. ใส่ Redirect URI **ตรงทุกตัวอักษร**:

```
http://localhost:3000/auth/callback
```

5. **Save**

| ถูก | ผิด |
|-----|-----|
| `http://localhost:3000/auth/callback` | `https://...` |
| ไม่มี `/` ท้าย | `http://localhost:3000/auth/callback/` |
| อยู่ใต้ **SPA** | อยู่ใต้ Web เท่านั้น |

ลบ URI เก่าที่ไม่ใช้แล้ว (เช่น `/auth/microsoft/callback`, `/api/auth/...`)

> ถ้า port ไม่ใช่ 3000 ให้ตั้ง `NEXT_PUBLIC_AZURE_REDIRECT_URI` ใน `.env` ให้ตรงกับ Azure

#### 3. Login
หน้าแรก → **เซลล์** → Sign in with Microsoft → เข้าหน้าอนุมัติออเดอร์

### Admin Dev
- อีเมลที่อยู่ใน `ADMIN_EMAILS` จะได้ role `admin`
- เข้า `/admin/dev` เพื่อทดสอบทั้งสองฝั่ง

## สูตรคำนวณ

| ค่า | สูตร |
|-----|------|
| Stock CVD | stock ÷ avg sales |
| MIN | avg sales × 7 วัน (ปรับได้) |
| MAX | avg sales × 15 วัน (ปรับได้) |
| Suggest Order | ถ้า stock < MIN → ceil(MAX - stock + avg×3) |
| CVD Est. | (stock + order qty) ÷ avg sales |

## PO Integration (Stub)

เมื่อเซลล์อนุมัติ ระบบจะบันทึก JSON ที่ `logs/po-export/{orderId}.json`

## Fabric Master Data (ร้านค้า + เซลล์)

### ดึงครั้งเดียว (มือ)

```bash
npm run sync:masters
```

ไฟล์ cache อยู่ที่ `data/cache/` — แอปอ่านจากที่นี่ ไม่ต้อง sync ทุกครั้งที่เปิด

### ตั้งเวลารายวัน (แบบ ocr-po-matching)

**วิธีที่ 1 — ในแอป (server รันค้าง 24/7)**

เพิ่มใน `.env`:

```env
MASTER_REFRESH_ENABLED=true
MASTER_REFRESH_HOUR=3
MASTER_REFRESH_MINUTE=30
```

รัน `npm run build` แล้ว `npm run start` — scheduler จะดึงทุกวันเวลา **03:30 น. (Asia/Bangkok)** อัตโนมัติ (retry 3 ครั้งถ้าล้มเหลว)

> `npm run dev` ไม่เปิด scheduler โดย default (กัน sync ซ้ำตอนพัฒนา)

**วิธีที่ 2 — Windows Task Scheduler (ไม่ต้องเปิดแอปค้าง)**

1. เปิด **Task Scheduler** → Create Basic Task
2. Trigger: Daily เวลา 03:30
3. Action: Start a program → `scripts\sync-masters-daily.bat`
4. Start in: โฟลเดอร์โปรเจกต VMI

**ดึงมือจากหน้า Admin:** `/admin/dev` → ปุ่ม "ดึงข้อมูล master ตอนนี้"

## Fabric Lakehouse (Phase 2 — stock/SKU)

ตั้ง `DATA_SOURCE=fabric` และ implement `FabricStockRepository` ใน `lib/repositories/`

## โครงสร้างหลัก

```
app/           # Pages & API routes
components/    # UI components
lib/           # Business logic, auth, repositories
prisma/        # Database schema & seed
```
