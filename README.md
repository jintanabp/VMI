# VMI - Vendor Managed Inventory

เว็บแอปจัดการสต็อก แนะนำการสั่งสินค้า และอนุมัติออเดอร์ สำหรับคลัง **VDA** และทีมเซลล์
ดึงยอดขาย/สต็อก/ราคา/โปร C4 จาก Microsoft Fabric (OneLake) มาคำนวณจำนวนแนะนำสั่ง
ร้านส่งออเดอร์ → เซลล์ตรวจและอนุมัติ → ระบบออกเลข PO → ส่ง PO เข้า ERP

> **สถานะ (29 ก.ย. 2569):** งานฝั่งโค้ดเสร็จครบ ที่เหลืออยู่นอกโค้ดทั้งหมด —
> ดู [สถานะปัจจุบันในหน้าแรก Wiki](./docs/wiki/00-home.md#สถานะปัจจุบัน-29-กย-2569)

## ฟีเจอร์ตามบทบาท

- **คลัง VDA / ร้านค้า** (อีเมล + รหัสผ่าน) — ดูสต็อก/CVD, แก้ MIN/MAX และรายการหยุดสั่ง, ดูราคา/โปร C4,
  ยอดขายย้อนหลัง 7/30/90 วัน, เลือกสินค้าแล้วส่งออเดอร์ (ราคาตามระบบ ร้านแก้เองไม่ได้),
  ดูประวัติและของแถมที่ควรได้, ยืนยัน/ปฏิเสธรายการที่เซลล์เพิ่มให้
- **เซลล์** (Microsoft Entra ID) — หน้าภาพรวมสรุปงานค้าง, ตรวจ/แก้จำนวน/แก้ราคา/ปฏิเสธรายการ/
  เพิ่มสินค้าใหม่เข้าออเดอร์, อนุมัติทีละใบ หลายใบ หรือเฉพาะบางรายการ, แบ่ง/รวม PO, เคลียร์ออเดอร์สิ้นเดือน,
  กระดิ่งแจ้งเตือน (กดแล้วเปิดใบออเดอร์), ออกเลข PO, ส่ง PO เข้า ERP และติดตามสถานะ
- **Admin** (อีเมลที่ Creator เพิ่มในหน้า «ระบบ › ผู้ดูแล» — ตาราง `Admin`) — ใช้หน้าตั้งค่าได้เฉพาะบางแท็บ:
  ดู/อนุมัติ/สร้างบัญชีร้าน รีเซ็ตรหัสผ่าน, ดูโปร C4, ดูตารางรหัสเซลล์และเพิ่มอีเมลให้รหัสเซลล์
  (รายการสิทธิ์อยู่ที่ `lib/auth/permissions.ts`) · ถ้าผูกรหัสเซลล์ไว้จะใช้หน้าเซลล์ได้ด้วย
- **Creator (dev)** (อีเมลใน `ADMIN_EMAILS` ของ `.env`) — ทำได้ทุกอย่างที่ `/admin`: sync Fabric,
  ดูข้อมูลดิบ, ทะเบียนคลัง VDA, MIN/MAX & หยุดสั่ง, มุมมองทดสอบ (ดูเป็น VDA/เซลล์), จัดการผู้ดูแล,
  สิทธิ์เซลล์-VDA, บันทึกการทำงาน (audit log) และเห็นออเดอร์ทุกร้าน (กรองตามรหัสเซลล์ได้)

รองรับจอ desktop และจอแคบ (iPad / ครึ่งจอ / มือถือ) — ต่ำกว่า 1280px ตารางแสดงเป็นรายการ 2 บรรทัดโดยไม่ต้องเลื่อนซ้าย-ขวา

## Tech Stack

| ชั้น | เทคโนโลยี (เวอร์ชันจาก `package.json`) |
|---|---|
| Framework | Next.js ^15.3.3 (App Router) · React ^19.1.0 · TypeScript ^5.8.3 |
| UI | Tailwind CSS ^4.1.10 · Radix UI + คอมโพเนนต์สไตล์ shadcn ใน `components/ui` · lucide-react |
| ข้อมูลฝั่ง client | TanStack Query ^5.80.7 · TanStack Virtual ^3.14.6 |
| DB | Prisma ^6.9.0 + SQLite |
| Auth | Microsoft Entra ID (authorization code + PKCE ฝั่งเบราว์เซอร์) · session cookie เซ็น HMAC |
| ข้อมูลภายนอก | Microsoft Fabric OneLake ผ่าน `@azure/identity` ^4.13.1 |
| อื่น ๆ | ExcelJS ^4.4.0 (ส่งออก Excel) · Zod ^3.25.61 |
| เทสต์ | Vitest ^3.2.7 — ตรรกะล้วนเป็นหลัก + `*.db.test.ts` ที่ใช้ SQLite ชั่วคราว |

## เริ่มต้นใช้งาน (Local)

```bash
npm install          # postinstall รัน prisma generate ให้เอง
cp .env.example .env # แล้วแก้ค่าตามหัวข้อ "ตั้งค่า .env" ด้านล่าง

npm run db:setup     # migrate + seed (โหมด dummy)
npm run dev          # ต้องใช้ port 3000
```

เปิด [http://localhost:3000/vmi/](http://localhost:3000/vmi/)
(`basePath` เป็น `/vmi` — path ในแอปทั้งหมดอยู่ภายใต้ `/vmi`)

### ตั้งค่า `.env`

`.env.example` คือแหล่งอ้างอิงหลักของตัวแปรทั้งหมด (มีคำอธิบายรายบรรทัด) — ที่ต้องตั้งจริงมีไม่กี่ตัว

| ตัวแปร | หมายเหตุ |
|---|---|
| `DATABASE_URL` | dev: `file:./dev.db` · Docker override เป็น `file:/app/data/vmi.db` ให้เอง |
| `NEXTAUTH_SECRET` | ≥ 32 ตัว — production **ไม่ start** ถ้าว่าง สั้น หรือยังเป็นค่าตัวอย่าง |
| `ADMIN_EMAILS` | อีเมล Creator (คั่นด้วย `,` หรือ `;`) |
| `DATA_SOURCE` | `dummy` (dev) / `fabric` (ใช้งานจริง) |
| `ONELAKE_*` · `STOCK_ONELAKE_*` | service principal ของ masters และของ stock (คนละตัว) |
| `ALERT_EMAIL` + `SENDER_EMAIL` | ต้องตั้ง**ทั้งคู่** ไม่งั้นอีเมลแจ้ง sync ล้มจะถูกข้ามแบบเงียบ |
| `VDA_CUSTOMER_MAP` | ใช้ seed ทะเบียนคลังครั้งแรกเท่านั้น หลังจากนั้นแก้ที่ `/admin/data/warehouses` |
| `MASTER_REFRESH_ENABLED/HOUR/MINUTE` | scheduler รายวัน (เปิดอยู่โดย default) |

ที่อยู่ไฟล์ต้นทาง, ตาราง C4, client/tenant id ของ Azure และปลายทาง ERP **อยู่ในโค้ดแล้ว ไม่ต้องตั้ง**
ค่าใน `.env` ชนะโค้ดเสมอและเงียบสนิทเวลาตั้งผิด — ตั้งอะไรเพิ่มต้องเปิด `/admin/data/sync` กับ
`/admin/promotions/c4` ตรวจทุกครั้ง

สร้าง `NEXTAUTH_SECRET`

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### โหมดข้อมูล

| `DATA_SOURCE` | ใช้เมื่อ | หมายเหตุ |
|---------------|---------|----------|
| `dummy` | พัฒนา UI / ทดลองสูตร | ใช้ seed จาก `npm run db:setup` |
| `fabric` | ใช้งานจริง | ตั้ง `ONELAKE_*`, `STOCK_ONELAKE_*` แล้วรัน `npm run sync:masters` |

### ฐานข้อมูล — แก้ schema ต้องมี migration จริง

แก้ `prisma/schema.prisma` แล้ว**ต้อง**รัน `npm run db:migrate` (= `prisma migrate dev`) เพื่อสร้างไฟล์ migration
แล้ว commit ไปด้วย · **ห้ามใช้ `prisma db push`** — ฐานในเครื่องจะดูปกติ แต่ production ที่รัน
`prisma migrate deploy` ตอน start จะไม่มีคอลัมน์ใหม่ แล้วหน้าเว็บพัง 500

### ถ้า `npm run dev` ไม่ได้

| อาการ | วิธีแก้ |
|--------|--------|
| `Port 3000 ถูกใช้อยู่` | `npm run dev:stop` แล้ว `npm run dev` |
| `ไม่พบ database` | `npm run db:setup` |
| Login Microsoft ไม่ได้ | รันที่ **port 3000** และตรวจ Redirect URI ใน Azure |
| ตรวจสอบระบบ | `http://localhost:3000/vmi/api/health` → มี `"ok":true` |
| chunk หาย / build แปลก | `npm run clean` แล้ว `npm run dev` |

> **สำคัญ:** หยุด `npm run dev` ก่อนรัน `npm run build` — ทั้งคู่ใช้โฟลเดอร์ `.next/` ร่วมกัน
> ถ้าไม่หยุดจะเจอ error "โมดูลหาย" ที่ไม่ใช่บั๊กจริง

## ทดสอบการใช้งาน

### คลัง VDA / ร้านค้า

ร้านเข้าระบบด้วย **อีเมล + รหัสผ่าน** (`StoreAccount`) ต้องมีบัญชีก่อน

1. หน้าแรก → **คลัง VDA** → กรอกอีเมล → เลือก VDA → ส่งคำขอ
2. เข้า `/vmi/admin/stores/accounts` ด้วยบัญชี Creator/Admin → อนุมัติคำขอ
3. กลับไป login → ตั้งรหัสผ่านครั้งแรก (≥ 8 ตัวอักษร) → เข้าใช้งาน

ทางลัดสำหรับ dev: เข้าสู่ระบบเป็น Creator แล้วเปิด `/vmi/admin/preview/vda` เลือกรหัส VDA
เพื่อเข้าดูข้อมูลร้านค้าโดยไม่ต้องสร้างบัญชี

> ⚠️ `POST /api/auth/customer/login` (เลือก VDA แล้วเข้าเลย) **เป็น admin-only ตั้งแต่ 28 ส.ค. 2569**
> รายละเอียดที่ [03 — การยืนยันตัวตน](./docs/wiki/03-authentication.md)

> โหมด `fabric`: รายการ VDA มาจากทะเบียนคลังในฐานข้อมูล + `stock_cover_day` — ถ้าว่างให้ sync ก่อน

### เซลล์ (Microsoft Entra ID)

1. ตั้ง `NEXTAUTH_SECRET` และ `ADMIN_EMAILS` ใน `.env`
   (ถ้าใช้ confidential client เพิ่ม `AZURE_AD_CLIENT_SECRET` และ `AZURE_AD_USE_CLIENT_SECRET=true`)
2. Azure Portal → **Authentication** → **Single-page application** → Redirect URI
   `http://localhost:3000/vmi/auth/callback` (ห้ามมี `/` ท้าย · ต้องอยู่ใต้ SPA ไม่ใช่ Web)
   · production: `https://spc-ai.sahapat.com/vmi/auth/callback`
   (โค้ดสร้าง URI จาก origin ของเบราว์เซอร์เอง — ไม่ต้องตั้ง `NEXT_PUBLIC_AZURE_REDIRECT_URI`)
3. หน้าแรก → **เซลล์ / Admin** → Sign in with Microsoft → `/sales` (หน้าภาพรวม)

### Admin / Creator

`/admin` แบ่งเป็น 5 หมวด: `data/` (sync, ดูข้อมูลดิบ, ทะเบียนคลัง VDA) · `stores/` (บัญชีร้านค้า, MIN/MAX & หยุดสั่ง) ·
`promotions/` (โปร C4 เดือนนี้) · `preview/` (มุมมอง VDA/เซลล์) · `system/` (ผู้ดูแล, สิทธิ์เซลล์-VDA, บันทึกการทำงาน)
— Admin เห็นเฉพาะแท็บที่มีสิทธิ์ · URL รูปแบบเดิม เช่น `/admin/sync` ยังใช้ได้ผ่าน redirect

## สูตรคำนวณ (ย่อ)

| ค่า | สูตร |
|-----|------|
| Stock CVD | stock ÷ avg sales |
| MIN | avg sales × 7 วัน (ปรับได้) |
| MAX | avg sales × 15 วัน (ปรับได้) |
| Suggest Order | ถ้า stock < MIN → ceil(MAX − stock + avg × 3) · ปัดขึ้นเสมอ (ตั้งใจ) |
| CVD Est. | (stock + order qty) ÷ avg sales → ธงเขียว/เหลือง/แดง |

รายละเอียดและกฎทั้งหมดอยู่ใน [08 — กฎทางธุรกิจ](./docs/wiki/08-business-rules.md)

## ใบสั่งซื้อ (PO) และ ERP

- อนุมัติแล้วระบบออกเลข PO จริง (`PurchaseOrder` + `PoSequence`) แบ่งใบ "ราคาตรง C4" / "ราคาไม่ตรง C4"
  อัตโนมัติ และไม่ให้กลุ่มโปรเดียวกันหลุดคนละใบ (`lib/po/split-plan.ts`)
- ราคา โปร และของแถมถูก **แช่ไว้ตอนร้านกดส่ง** (`OrderItem.c4Promo*` / `c4FreeGood*`)
- หน้า `/sales/po` — ค้นหา กรอง ดูรายละเอียด พิมพ์ โหลด Excel และส่งเข้า ERP
- สถานะ: ออกแล้ว → ส่งซัพแล้ว / กำลังส่ง ERP → เข้า ERP แล้ว หรือ **ERP ไม่ตอบ — รอตรวจ** (`erp_unknown`)
  → รับของแล้ว / ยกเลิก · ค่าอยู่ที่ `lib/po/po-status.ts` แก้ได้โดยไม่ต้อง migrate
- ปลายทาง ERP อยู่ในโค้ด (`lib/po/erp-endpoint.ts`) และชี้ **UAT เท่านั้น** — โฮสต์ production ไม่มีในโค้ด ·
  ปิดขาส่งบนเครื่อง dev ด้วย `ERP_SEND_DISABLED=1`

> ⚠️ ยิงเข้า ERP ผิดใบเดียว = คู่เลขออเดอร์ + รหัสลูกค้าถูกล็อก 6 เดือน — **อย่าเรียก endpoint `send-erp`**
> ระหว่างพัฒนา/ทดสอบ รายละเอียดใน [`docs/ERP-PO-PLAN.md`](./docs/ERP-PO-PLAN.md)

> ⚠️ ของแถมของ**โปรกลุ่ม** ติดมาทุกบรรทัดในกลุ่ม — รวมยอดด้วย `collectOwedFreeGoods()`
> (`lib/promo/order-free-goods.ts`) เท่านั้น ห้ามบวกเอง ไม่งั้นของแถมจะคูณตามจำนวนสมาชิก

## Fabric / OneLake (ย่อ)

- ดึงมือ: `npm run sync:masters` · cache อยู่ที่ `data/cache/` (Docker: volume `vmi_data`)
- อัตโนมัติ: scheduler ในโปรเซส (`instrumentation.ts` → `lib/fabric/scheduler.ts`) ทุกวัน **03:30 น. Asia/Bangkok** ·
  retry 3 ครั้ง (5/15/30 นาที) · แจ้ง `ALERT_EMAIL` เมื่อล้มครบทุกรอบ · สำรองฐานข้อมูลทุกรอบประจำวัน ไม่ขึ้นกับผล sync
- ตอน boot: โหลดไฟล์ที่ยังไม่มี และถ้ารอบสำเร็จล่าสุดเก่ากว่า `MASTER_REFRESH_MAX_AGE_HOURS` (20) จะไล่ตามในอีก 30 วินาที
- ทุกทริกเกอร์ (scheduler / boot / ปุ่มแอดมิน / ปุ่มร้าน / CLI) ผ่าน `runMasterRefresh` ตัวเดียว
- ⚠️ ถ้าใช้ Windows Task Scheduler (`npm run sync:masters:daily`) ต้องตั้ง `MASTER_REFRESH_ENABLED=false` ไม่งั้นดึงซ้ำสองรอบ

ชุดข้อมูล สิทธิ์ของ service principal และ env ทั้งหมดอยู่ใน [06 — Fabric / OneLake](./docs/wiki/06-fabric-integration.md)

## ทดสอบ

```bash
npm test                              # vitest run
npx vitest run --no-file-parallelism  # เครื่องช้า — กัน *.db.test.ts หมดเวลาตอนสร้างฐานข้อมูล
npm run lint
npm run build                         # หยุด npm run dev ก่อน
```

## Production Deploy (ย่อ)

```bash
docker compose up -d --build
curl -fsSL http://127.0.0.1:3002/vmi/api/health/
```

- host port **3002** (bind `127.0.0.1`) → container 3000 · project/container ชื่อ **`vmi`** ·
  อยู่หลัง nginx ที่ path `/vmi/` (**ห้ามตัด prefix** ใน `proxy_pass`)
- ตอน start: สำรองฐานข้อมูลก่อน แล้ว `prisma migrate deploy`
- volumes: `vmi_data` (SQLite + Fabric cache) · `vmi_backups` (ไฟล์สำรอง DB) · `vmi_logs` (เอกสาร PO `logs/po-export/*.json`)
- `NEXT_PUBLIC_*` ตั้งใน `.env` บน server ไม่ได้ (ฝังลง JS ตอน build และ `.dockerignore` กัน `.env` ออก)
- โฟลเดอร์ `deploy/` (scripts / nginx / OliveTin snippets) เก็บ local บน server เท่านั้น — ไม่ขึ้น git

ขั้นตอนเต็ม nginx และ Azure อยู่ใน [09 — Production Deploy](./docs/wiki/09-deployment.md)

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run dev` · `npm run dev:turbo` | Dev server (port 3000) · แบบ Turbopack |
| `npm run dev:stop` | หยุด dev server ที่ค้างอยู่ |
| `npm run clean` | ลบโฟลเดอร์ `.next/` |
| `npm run build` / `npm start` | Build และรัน production ในเครื่อง |
| `npm run lint` | ตรวจ ESLint |
| `npm test` · `npm run test:watch` | รันชุดทดสอบ (vitest) |
| `npm run db:setup` | migrate + seed |
| `npm run db:migrate` | สร้าง/ใช้ migration (ทุกครั้งที่แก้ schema) |
| `npm run db:generate` · `npm run db:seed` | สร้าง Prisma client ใหม่ · seed ข้อมูล |
| `npm run sync:masters` | ดึง Fabric → `data/cache/` (`-- --interactive` = ล็อกอินผ่านเบราว์เซอร์) |
| `npm run backup:db` | สำรอง SQLite |
| `npm run verify:promo-context` · `verify:promo-parity` · `verify:sales-cover` | ตรวจบริบทโปร C4 / ผลโปร / ความครอบคลุมยอดขาย |
| `npm run probe:*` · `npm run snapshot:promo` | สคริปต์สำรวจข้อมูล OneLake / เก็บ baseline โปร |
| `npm run erp:preview` | ดู payload ที่จะส่ง ERP (ไม่ยิงจริง) |
| `docker compose up -d --build` | Deploy production |

## โครงสร้างหลัก

```
app/              # Pages & API routes
components/       # UI
lib/              # Business logic: auth, fabric, repositories, po, promo, calculations ...
hooks/            # React hooks ที่ใช้ร่วมหลายหน้า
tests/            # Vitest · helpers/ = ตัวช่วยสร้าง DB ชั่วคราว
prisma/           # Schema, migrations & seed
docs/             # Wiki + แผนงาน
docker/           # Dockerfile, entrypoint
scripts/          # sync, backup, verify, probe
```

รายละเอียดรายโฟลเดอร์อยู่ใน [12 — โครงสร้างโปรเจกต์](./docs/wiki/12-project-structure.md)

## 📖 เอกสาร

| ถ้าคุณคือ | เริ่มที่ |
|---|---|
| ผู้ใช้งาน (ร้าน / เซลล์ / แอดมิน) | [04 — คู่มือผู้ใช้](./docs/wiki/04-user-guide.md) |
| นักพัฒนาที่เพิ่งรับช่วงงาน | [11 — คู่มือนักพัฒนา](./docs/wiki/11-developer-guide.md) → [12 — โครงสร้างโปรเจกต์](./docs/wiki/12-project-structure.md) |
| ผู้ดูแลระบบ server | [09 — Deploy](./docs/wiki/09-deployment.md) · [10 — แก้ปัญหา](./docs/wiki/10-operations-troubleshooting.md) |

| หน้า | หัวข้อ |
|---|---|
| [00 — หน้าแรก](./docs/wiki/00-home.md) | สารบัญ Wiki · สถานะปัจจุบัน |
| [01 — ภาพรวมโปรเจกต์](./docs/wiki/01-overview.md) | ธุรกิจ บทบาท flow หลัก แนวคิดสำคัญ |
| [02 — สถาปัตยกรรม](./docs/wiki/02-architecture.md) | ผังระบบ data flow auth scheduler |
| [03 — การยืนยันตัวตน](./docs/wiki/03-authentication.md) | Login ร้าน, Microsoft, Admin/Creator |
| [04 — คู่มือผู้ใช้](./docs/wiki/04-user-guide.md) | หน้าจอและขั้นตอนการใช้งาน |
| [05 — API Reference](./docs/wiki/05-api-reference.md) | รายการ API |
| [06 — Fabric / OneLake](./docs/wiki/06-fabric-integration.md) | sync, scheduler, cache, env |
| [07 — Data Model](./docs/wiki/07-data-model.md) | Prisma schema |
| [08 — กฎทางธุรกิจ](./docs/wiki/08-business-rules.md) | CVD, ออเดอร์, PO, โปร C4 |
| [09 — Production Deploy](./docs/wiki/09-deployment.md) | Docker, nginx, Azure |
| [10 — ปฏิบัติการ & แก้ปัญหา](./docs/wiki/10-operations-troubleshooting.md) | health, backup, FAQ |
| [11 — คู่มือนักพัฒนา](./docs/wiki/11-developer-guide.md) | setup, กับดัก, งานที่พบบ่อย |
| [12 — โครงสร้างโปรเจกต์](./docs/wiki/12-project-structure.md) | แผนที่โฟลเดอร์และไฟล์สำคัญ |
| [แผนปรับปรุงระบบ](./docs/IMPROVEMENT-PLAN.md) | งานค้าง · changelog |
| [แผนส่ง PO เข้า ERP](./docs/ERP-PO-PLAN.md) | เฟส ERP · ข้อ 3.6 ที่รอทีมข้อมูล |
