# VMI - Vendor Managed Inventory

เว็บแอปจัดการสต็อก แนะนำการสั่งสินค้า และอนุมัติคำสั่งซื้อ สำหรับคลัง **VDA** และทีมเซลล์

## ฟีเจอร์หลัก

- **คลัง VDA / ร้านค้า** — ดูสต็อก/CVD, แก้ MIN/MAX, ดูราคา/โปร C4, ยอดขายย้อนหลัง 7/30/90 วัน,
  เลือกสินค้าแล้วส่งคำสั่ง, ดูประวัติและของแถมที่ควรได้
- **เซลล์** — เข้าด้วย Microsoft Entra ID, หน้าภาพรวมสรุปงานค้าง, ตรวจ/แก้จำนวน/แก้ราคา/อนุมัติ
  ทีละใบหรือหลายใบ, ออกเลข PO และติดตามสถานะ
- **Admin** — ศูนย์ควบคุมที่ `/admin`: อนุมัติบัญชีร้าน, เข้าดูมุมมอง VDA/เซลล์, sync Fabric, จัดการ admin

รองรับจอ desktop และจอแคบ (iPad / ครึ่งจอ) — ตารางแสดงเป็นรายการ 2 บรรทัดโดยไม่ต้องเลื่อนซ้าย-ขวา

### 📖 เอกสาร

| ถ้าคุณคือ | เริ่มที่ |
|---|---|
| ผู้ใช้งาน (ร้าน / เซลล์ / แอดมิน) | [คู่มือผู้ใช้](./docs/wiki/04-user-guide.md) |
| นักพัฒนาที่เพิ่งรับช่วงงาน | [คู่มือนักพัฒนา](./docs/wiki/11-developer-guide.md) |
| คนดูแลระบบ | [Deploy](./docs/wiki/09-deployment.md) · [แก้ปัญหา](./docs/wiki/10-operations-troubleshooting.md) |

## Tech Stack

- Next.js 15 + TypeScript
- Tailwind CSS + shadcn-style components
- Prisma + SQLite
- Microsoft Entra ID (authorization code + PKCE ฝั่งเบราว์เซอร์)
- Microsoft Fabric OneLake (ข้อมูล master / stock / โปร)
- TanStack Query
- Vitest — ตรรกะล้วนเป็นหลัก และ `*.db.test.ts` ที่ใช้ SQLite ชั่วคราว (`npm test`)

📚 เอกสารละเอียดอยู่ที่ [`docs/wiki/`](./docs/wiki/00-home.md)

## เริ่มต้นใช้งาน (Local)

```bash
npm install
cp .env.example .env
# แก้ .env ตามต้องการ (ดูด้านล่าง)

npm run db:setup    # สร้าง DB + seed (โหมด dummy)
npm run dev         # ต้องใช้ port 3000
```

เปิด [http://localhost:3000/vmi/](http://localhost:3000/vmi/)  
(`basePath` เป็น `/vmi` — path ในแอปทั้งหมดอยู่ภายใต้ `/vmi`)

### โหมดข้อมูล

| `DATA_SOURCE` | ใช้เมื่อ | หมายเหตุ |
|---------------|---------|----------|
| `dummy` (default) | พัฒนา UI / ทดลองสูตร | ใช้ seed จาก `npm run db:setup` |
| `fabric` | ใช้งานจริง | ตั้ง `ONELAKE_*`, `STOCK_ONELAKE_*`, โปร C4 ฯลฯ ใน `.env` แล้วรัน `npm run sync:masters` |

รายละเอียดตัวแปรทั้งหมดอยู่ใน `.env.example`

### สร้าง `NEXTAUTH_SECRET`

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### ถ้า `npm run dev` ไม่ได้

| อาการ | วิธีแก้ |
|--------|--------|
| `Port 3000 ถูกใช้อยู่` | `npm run dev:stop` แล้ว `npm run dev` |
| `ไม่พบ database` | `npm run db:setup` |
| Login Microsoft ไม่ได้ | รันที่ **port 3000** และตรวจ Redirect URI ใน Azure |
| ตรวจสอบระบบ | `http://localhost:3000/vmi/api/health` → มี `"ok":true` |
| chunk หาย / build แปลก | `npm run clean` แล้ว `npm run dev` |

## ทดสอบการใช้งาน

### คลัง VDA / ร้านค้า

ร้านเข้าระบบด้วย **อีเมล + รหัสผ่าน** (`StoreAccount`) ต้องมีบัญชีก่อน

1. หน้าแรก → **คลัง VDA** → กรอกอีเมล → เลือก VDA → ส่งคำขอ
2. เข้า `/vmi/admin/stores/accounts` ด้วยบัญชี admin → อนุมัติคำขอ
3. กลับไป login → ตั้งรหัสผ่านครั้งแรก (≥ 8 ตัวอักษร) → เข้าใช้งาน

ทางลัดสำหรับ dev: เข้าสู่ระบบเป็น admin แล้วเปิด `/vmi/admin/preview/vda` เลือกรหัส VDA
เพื่อเข้าดูข้อมูลร้านค้าโดยไม่ต้องสร้างบัญชี

> ⚠️ `POST /api/auth/customer/login` (เลือก VDA แล้วเข้าเลย) **เป็น admin-only ตั้งแต่ 28 ส.ค. 2569**
> เดิมเปิดให้ทุกคนเรียกใช้ได้ ทำให้สามารถสวมรอยเป็นร้านค้าได้
> รายละเอียดที่ [03 — การยืนยันตัวตน](./docs/wiki/03-authentication.md)

> โหมด `fabric`: รายการ VDA มาจาก OneLake (`stock_cover_day`) — ถ้าว่างให้ sync ก่อน

### เซลล์ (Microsoft Entra ID)

#### 1. ตั้งค่า `.env`

```env
NEXT_PUBLIC_AZURE_AD_CLIENT_ID=<จาก Azure Portal>
NEXT_PUBLIC_AZURE_AD_TENANT_ID=<จาก Azure Portal>
NEXTAUTH_SECRET=<random hex>
ADMIN_EMAILS=<อีเมลของคุณ>
```

ถ้าใช้ confidential client (Web platform) เพิ่ม `AZURE_AD_CLIENT_SECRET` และ `AZURE_AD_USE_CLIENT_SECRET=true`

#### 2. Redirect URI ใน Azure Portal

**Authentication** → **Single-page application** → เพิ่ม:

```
http://localhost:3000/vmi/auth/callback
```

| ถูก | ผิด |
|-----|-----|
| `http://localhost:3000/vmi/auth/callback` | มี `/` ท้าย URL |
| อยู่ใต้ **SPA** | อยู่ใต้ Web เท่านั้น |

Production: ตั้ง `NEXT_PUBLIC_AZURE_REDIRECT_URI=https://spc-ai.sahapat.com/vmi/auth/callback` ให้ตรงกับ Azure

#### 3. Login

หน้าแรก → **เซลล์ / Admin** → Sign in with Microsoft → `/sales` (หน้าภาพรวม)

### Admin

- อีเมลใน `ADMIN_EMAILS` / `APP_ADMINS` จะได้รับ role `admin`
- `/admin` แบ่งเป็น 5 หมวด: `data/` (sync, ดูข้อมูลดิบ, ทะเบียนคลัง VDA) ·
  `stores/` (บัญชีร้านค้า, MIN/MAX) · `promotions/` · `preview/` (มุมมอง VDA/เซลล์) · `system/`
- URL รูปแบบเดิม เช่น `/admin/sync` ยังใช้งานได้ผ่านการ redirect

## สูตรคำนวณ

| ค่า | สูตร |
|-----|------|
| Stock CVD | stock ÷ avg sales |
| MIN | avg sales × 7 วัน (ปรับได้) |
| MAX | avg sales × 15 วัน (ปรับได้) |
| Suggest Order | ถ้า stock < MIN → ceil(MAX - stock + avg×3) |
| CVD Est. | (stock + order qty) ÷ avg sales |

## ใบสั่งซื้อ (PO)

เมื่อเซลล์อนุมัติออเดอร์ ระบบจะ **ออกเลข PO จริง** ไม่ใช่ stub แล้ว

| เรื่อง | รายละเอียด |
|---|---|
| ตาราง | `PurchaseOrder` (เลข PO, กลุ่ม, ประเภทราคา, ยอด, สถานะ) + `PoSequence` (running number ต่อคลัง/วัน) |
| เลข PO | `lib/po/po-number.ts` — รูปแบบ `{prefix}{ปี}{เดือนวัน}{ลำดับ}` ต่อท้าย A/B เมื่อแบ่งใบ |
| แบ่งใบ | `lib/po/split-plan.ts` — แยก "ราคาตรง C4" ออกจาก "ราคาไม่ตรง C4" · ตรวจไม่ให้กลุ่มโปรเดียวกันหลุดคนละใบ |
| เอกสาร | `lib/po/po-document.ts` เขียน JSON ที่ `logs/po-export/{poNumber}.json` เป็นหลักฐาน · ถ้าไฟล์หาย ระบบประกอบใหม่จาก DB ให้ (`lib/po/po-from-db.ts`) |
| หน้าเว็บ | `/sales/po` — ค้นหา กรองวันที่/คลัง/สถานะ แบ่งหน้า ดูรายละเอียดในเว็บ พิมพ์ และโหลด Excel (ทีละใบหรือหลายใบรวมไฟล์เดียว) |
| สถานะ | ออกแล้ว → ส่งซัพแล้ว → รับของแล้ว / ยกเลิก · **ปรับค่าได้ที่ `lib/po/po-status.ts` โดยไม่ต้อง migrate** (คอลัมน์เป็น `String` ไม่ใช่ enum) |

โปรโมชันและของแถมถูก **แช่ไว้ตอนร้านกดส่ง** (`OrderItem.c4Promo*` / `c4FreeGood*`)
เอกสาร PO จึงระบุได้ว่าบรรทัดไหนได้โปรอะไรและต้องแถมอะไรบ้าง

> ⚠️ ของแถมของ**โปรกลุ่ม** จะติดมาทุกบรรทัดในกลุ่ม — ต้องรวมยอดด้วย
> `collectOwedFreeGoods()` (`lib/promo/order-free-goods.ts`) เท่านั้น ห้ามบวกเอง ไม่งั้นของแถมจะคูณตามจำนวนสมาชิก

## Fabric / OneLake

### ดึงข้อมูล (มือ)

```bash
npm run sync:masters
```

Cache อยู่ที่ `data/cache/` (Docker: volume `vmi_data`)

ข้อมูลที่ sync:
- ร้านค้า / เซลล์ (master)
- สต็อก / CVD (`stock_cover_day`)
- ราคา SKU (`item_barcode_map_v2`)
- โปร C4 (`cft_promotion_cash`) — อยู่ workspace `Bronze_OrderAgent` คนละที่กับ masters
  และต้องใช้ auth profile ของ stock (`CFT_WORKSPACE_ID` / `CFT_LAKEHOUSE_ID` / `CFT_AUTH_PROFILE`)
  ไฟล์นี้มี `DIVISIONSALE|CUSTOMERGROUP` เดียวคือ `E|98` → `C4_DEFAULT_*` ต้องตั้งให้ตรง
  ตรวจได้ด้วย `npm run verify:promo-context` · rollback ด้วย `PROMOTION_CSV=...cft_promotion_credit.csv`
- ชื่อกลุ่มโปร (`cft_assorted_mapping`) — lakehouse เดียวกับ C4 แปลง `ASSORTEDPRODUCTGROUP`
  เป็น `DESCRIPTIONASSORTED` ให้ UI/Excel แสดงชื่อแทนรหัสกลุ่ม (ไม่มีไฟล์ = ถอยไปแสดงรหัสเหมือนเดิม)

### ตั้งเวลารายวัน (03:30 น. Bangkok)

ทุกฝั่งของระบบใช้ **ชุดข้อมูลเดียวกัน** ที่ดึงมาโดยฟังก์ชันเดียว (`runMasterRefresh`)
ไม่ว่าจะมาจาก scheduler, boot, ปุ่มแอดมิน, ปุ่มร้านค้า หรือ CLI

```env
# เปิดอยู่โดย default ทุก environment — ตั้ง =false เพื่อปิด
# MASTER_REFRESH_ENABLED=false
MASTER_REFRESH_HOUR=3
MASTER_REFRESH_MINUTE=30
MASTER_REFRESH_MAX_AGE_HOURS=20
ALERT_EMAIL=you@company.com
SENDER_EMAIL=noreply@company.com   # ต้องตั้งคู่กัน มิฉะนั้นไม่มีอีเมลออก
```

- **scheduler**: ทุกวัน 03:30 น. (Asia/Bangkok) — retry 3 ครั้ง (5/15/30 นาที),
  แจ้ง `ALERT_EMAIL` เมื่อล้มเหลวทุกรอบ (ต้องตั้ง `SENDER_EMAIL` ด้วย), สำรองฐานข้อมูลทุกรอบ
  ไม่ขึ้นกับผลลัพธ์ของ sync
- **boot catch-up**: ตอนสตาร์ท ถ้าไฟล์ไหนยังไม่มีจะโหลดให้ทันที และถ้ารอบสำเร็จล่าสุด
  เก่ากว่า `MASTER_REFRESH_MAX_AGE_HOURS` จะไล่ตามให้ในอีก 30 วินาที
  (เดิม restart หลัง 03:30 = ไม่มีข้อมูลใหม่จนวันรุ่งขึ้น)
- **ปุ่มร้านค้า** (`ตรวจข้อมูลใหม่`): อ่านชุดข้อมูลกลางซ้ำ + ล้าง cache ฝั่ง client
  และจะสั่งดึงจาก Fabric จริงเฉพาะเมื่อชุดกลางเก่าเกินกำหนด
- **แท็บที่เปิดค้าง**: poll `/api/data-version` ทุก 5 นาที (และเมื่อกลับมาที่แท็บ)
  พบ version ใหม่แล้ว invalidate cache ให้เอง — ไม่ต้องกดปุ่ม
- ทุกทริกเกอร์ใช้ credential แบบไม่ต้องมีคนกด (service principal) เท่านั้น
  การล็อกอินแบบเปิดเบราว์เซอร์เหลือใช้ได้แค่ CLI: `npm run sync:masters -- --interactive`

**ทางเลือก Windows:** Task Scheduler รัน `scripts\sync-masters-daily.bat`
⚠️ **ห้ามตั้งคู่กับ scheduler ในโปรเซส** — จะโหลดไฟล์ SKU 68 MB ซ้ำสองรอบ
ถ้าจะใช้ Task Scheduler ให้ตั้ง `MASTER_REFRESH_ENABLED=false`

**จาก Admin UI:** `/admin/sync` — มีสถานะรายตาราง (จำนวนแถว / ขนาด / อายุ / error)
และปุ่มดึงใหม่รายชุดข้อมูล

## Production Deploy (Docker + Linux)

### 1. เตรียม `.env` บน server

```bash
cp .env.example .env
# ใส่ค่าจริง: ONELAKE_*, STOCK_ONELAKE_*, NEXTAUTH_SECRET,
# ADMIN_EMAILS, ALERT_EMAIL, NEXT_PUBLIC_AZURE_AD_*,
# NEXT_PUBLIC_AZURE_REDIRECT_URI=https://spc-ai.sahapat.com/vmi/auth/callback
```

> **สำคัญ:** ต้องมี `.env` ครบ **ก่อน** `docker compose build` — ค่า `NEXT_PUBLIC_*` ถูก bake ตอน build

### 2. Build และรัน

```bash
docker compose up -d --build
curl -s http://127.0.0.1:3002/vmi/api/health
```

แอปรันที่ **host port 3002** → container `3000` (bind `127.0.0.1`)  
Compose project / container name: **`vmi`**

Container ทำ `prisma migrate deploy` อัตโนมัติตอน start

**Volumes:**
- `vmi_data` — SQLite + Fabric cache
- `vmi_backups` — backup DB หลัง sync สำเร็จ
- `vmi_logs` — PO export stub

### 3. nginx (path `/vmi/` บน spc-ai)

Next.js ใช้ `basePath: '/vmi'` — **ห้ามตัด prefix** ใน `proxy_pass`:

```nginx
location /vmi/ {
    proxy_pass         http://127.0.0.1:3002;  # ไม่มี / ท้าย
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    client_max_body_size 50M;
    proxy_read_timeout   120s;
    proxy_send_timeout   120s;
}

location = /vmi {
    return 301 /vmi/;
}
```

เพิ่ม Redirect URI ใน Azure (SPA): `https://spc-ai.sahapat.com/vmi/auth/callback`

โฟลเดอร์ `deploy/` (scripts / Nginx / OliveTin snippets) เก็บ **local บน server เท่านั้น** — ไม่ขึ้น git

### 4. Backup มือ

```bash
docker compose exec vmi node scripts/backup-db.mjs
# local: npm run backup:db
```

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run dev` | Dev server (port 3000) |
| `npm run build` / `npm start` | Production local |
| `npm run db:setup` | migrate + seed |
| `npm test` · `npm run test:watch` | รันชุดทดสอบ (vitest) |
| `npm run lint` | ตรวจ ESLint |
| `npm run clean` | ลบโฟลเดอร์ `.next/` |
| `npm run dev:stop` | หยุด dev server ที่ค้างอยู่ |
| `npm run sync:masters` | ดึง Fabric → cache |
| `npm run backup:db` | backup SQLite |
| `docker compose up -d --build` | Deploy production |

> **สำคัญ:** หยุด `npm run dev` ก่อนรัน `npm run build` — ทั้งคู่ใช้โฟลเดอร์ `.next/` ร่วมกัน
> ถ้าไม่หยุดจะเจอ error "โมดูลหาย" ที่ไม่ใช่บั๊กจริง

## โครงสร้างหลัก

```
app/              # Pages & API routes
components/       # UI
lib/              # Business logic, auth, Fabric, repositories, po, promo
hooks/            # React hooks ที่ใช้ร่วมหลายหน้า
tests/            # Vitest · helpers/ = ตัวช่วยสร้าง DB ชั่วคราว
prisma/           # Schema, migrations & seed
docs/wiki/        # เอกสารโปรเจกต์
docker/           # Dockerfile, entrypoint
scripts/          # sync, backup, verify
```
