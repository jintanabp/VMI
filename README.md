# VMI - Vendor Managed Inventory

เว็บแอปจัดการสต็อก แนะนำการสั่งสินค้า และอนุมัติคำสั่งซื้อ สำหรับคลัง **VDA** และทีมเซลล์

## ฟีเจอร์หลัก

- **คลัง VDA** — เลือก VDA, ดูสต็อก/CVD, แก้ MIN/MAX, ดูราคา/โปร C4, เลือกสินค้าแล้วส่งคำสั่ง
- **เซลล์** — เข้าด้วย Microsoft Azure AD, ตรวจ/อนุมัติ/ปฏิเสธออเดอร์, ดูโปรและมูลค่ารวม
- **Admin** — ศูนย์ควบคุมที่ `/admin`: ทดสอบมุมมอง VDA/เซลล์, sync Fabric, จัดการ admin

รองรับจอ desktop และจอแคบ (iPad / ครึ่งจอ) — ตารางแสดงเป็นรายการ 2 บรรทัดโดยไม่ต้องเลื่อนซ้าย-ขวา

## Tech Stack

- Next.js 15 + TypeScript
- Tailwind CSS + shadcn-style components
- Prisma + SQLite
- Microsoft Entra ID (OAuth ฝั่ง server)
- Microsoft Fabric OneLake (ข้อมูล master / stock / โปร)
- TanStack Query

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

### คลัง VDA (ไม่ต้องใช้ Azure)

1. หน้าแรก → **คลัง VDA**
2. เลือกรหัส VDA (เช่น `vda1`)
3. หน้าสต็อก → เลือกสินค้า → **สั่งสินค้า** → ส่งคำสั่ง

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

หน้าแรก → **เซลล์ / Admin** → Sign in with Microsoft → `/sales/orders`

### Admin

- อีเมลใน `ADMIN_EMAILS` / `APP_ADMINS` ได้ role `admin`
- `/admin` — ทดสอบมุมมอง VDA/เซลล์, ดึง master, ดูสถานะ sync

## สูตรคำนวณ

| ค่า | สูตร |
|-----|------|
| Stock CVD | stock ÷ avg sales |
| MIN | avg sales × 7 วัน (ปรับได้) |
| MAX | avg sales × 15 วัน (ปรับได้) |
| Suggest Order | ถ้า stock < MIN → ceil(MAX - stock + avg×3) |
| CVD Est. | (stock + order qty) ÷ avg sales |

## PO Integration (Stub)

เมื่อเซลล์อนุมัติ ระบบบันทึก JSON ที่ `logs/po-export/{orderId}.json`

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
- โปร C4 (`cft_promotion_credit`)
- แมป VDA → เซลล์ (`vda*_aos_bill`)

### ตั้งเวลารายวัน (03:30 น. Bangkok)

ใน `.env`:

```env
MASTER_REFRESH_ENABLED=true
MASTER_REFRESH_HOUR=3
MASTER_REFRESH_MINUTE=30
ALERT_EMAIL=you@company.com
```

- Production (`npm run start` / Docker): scheduler เปิดอัตโนมัติ — retry 3 ครั้ง, แจ้ง `ALERT_EMAIL` เมื่อล้มหมด
- `npm run dev`: ไม่เปิด scheduler (กัน sync ซ้ำตอนพัฒนา)

**ทางเลือก Windows:** Task Scheduler รัน `scripts\sync-masters-daily.bat` ทุกวัน 03:30

**จาก Admin UI:** `/admin` → ตั้งค่าระบบ → ดึงข้อมูล master ตอนนี้

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
| `npm run sync:masters` | ดึง Fabric → cache |
| `npm run backup:db` | backup SQLite |
| `docker compose up -d --build` | Deploy production |

## โครงสร้างหลัก

```
app/              # Pages & API routes
components/       # UI
lib/              # Business logic, auth, Fabric, repositories
prisma/           # Schema & seed
docker/           # Dockerfile, entrypoint
scripts/          # sync, backup
```
