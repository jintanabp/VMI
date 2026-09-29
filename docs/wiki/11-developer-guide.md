[← กลับหน้าแรก](./00-home.md)

# 11 — คู่มือนักพัฒนา (สำหรับผู้รับช่วงงาน)

เอกสารฉบับนี้จัดทำขึ้นสำหรับ **ผู้พัฒนาที่เข้ามาดูแลโปรเจกต์ต่อ** เมื่ออ่านจบควรสามารถ
แก้ไขและต่อยอดระบบได้โดยไม่กระทบส่วนที่ทำงานอยู่เดิม

- ต้องการทราบว่าระบบ *ทำหน้าที่อะไร* → [01 — ภาพรวมโปรเจกต์](./01-overview.md)
- ต้องการทราบว่า *ผู้ใช้เห็นหน้าจออย่างไร* → [04 — คู่มือผู้ใช้](./04-user-guide.md)
- ต้องการ *แผนที่ไฟล์ทั้ง repo* และ flow ของคำขอ → [12 — แผนที่โครงสร้างโปรเจกต์](./12-project-structure.md)

---

## 0. เริ่มจากตรงไหน (checklist ผู้รับช่วงงาน)

| ลำดับ | สิ่งที่ทำ | ดูที่ |
|---|---|---|
| 1 | อ่าน §2 หลักการสำคัญ และ §4 ข้อควรระวัง — ทุกข้อเป็นบั๊กที่เกิดจริง | หน้านี้ |
| 2 | ไล่แผนที่ไฟล์ + "แหล่งความจริง" ของแต่ละเรื่อง | [12](./12-project-structure.md) §2 |
| 3 | ติดตั้ง รัน `npm test` ให้ผ่านก่อนแก้อะไร | §1, §5 |
| 4 | เข้าใช้ทุกตำแหน่งบนเครื่องตัวเอง (Creator / Admin / เซลล์ / ร้าน) | §6.1 |
| 5 | อ่านกติกาความปลอดภัยของ ERP ก่อนแตะ `lib/po/erp-*` | §7 |
| 6 | ดูงานค้างและเหตุผลประกอบ | [`docs/IMPROVEMENT-PLAN.md`](../IMPROVEMENT-PLAN.md) · [`docs/ERP-PO-PLAN.md`](../ERP-PO-PLAN.md) |
| 7 | ก่อนส่งงานทุกครั้ง ทำ checklist | §8 |
| 8 | ขอสิทธิ์/ข้อมูลที่ไม่อยู่ใน repo: `.env` ของ server, สิทธิ์ Azure App Registration, service principal ของ OneLake (masters / stock), เครื่อง server + nginx | [09](./09-deployment.md) · [06](./06-fabric-integration.md) |

---

## 1. การติดตั้งครั้งแรก

```bash
git clone <repo> && cd VMI
npm install                  # postinstall เรียก prisma generate ให้อัตโนมัติ
cp .env.example .env         # อ่านคำอธิบายส่วนหัวของไฟล์ — ตั้งจริงราว 21 บรรทัด
npm run db:setup             # prisma migrate dev + seed (seed = ล้างข้อมูล demo ไม่ได้ใส่ตัวอย่าง)
npm run dev                  # ต้องใช้ port 3000 เท่านั้น
```

เปิดที่ <http://localhost:3000/vmi/> — ต้องมี `/vmi` เสมอ

| หัวข้อ | ค่า |
|---|---|
| Node | **20** (`node:20-bookworm-slim` ใน `docker/Dockerfile`, `@types/node ^20`) — `package.json` ไม่มีฟิลด์ `engines` |
| ฐานข้อมูล | SQLite ผ่าน Prisma 6 · dev = `prisma/dev.db` (`file:./dev.db` นับจากโฟลเดอร์ `prisma/`) |
| ข้อมูล master | ต้องมีไฟล์ใน `data/cache/` — ได้จาก `npm run sync:masters` (ต้องมี credential OneLake) หรือคัดลอกจากเครื่องที่ sync แล้ว |

> ⚠️ `prisma/seed.ts` **ลบออเดอร์ `pending_approval` ทุกใบ** และร้าน/SKU demo (`ST*`) — `db:setup`,
> `db:seed` และ `prisma migrate reset` เรียกตัวนี้ อย่ารันกับฐานข้อมูลที่มีออเดอร์จริงรออยู่

### 1.1 เหตุผลที่ต้องใช้ port 3000

Redirect URI ที่ลงทะเบียนไว้กับ Azure ผูกกับ `localhost:3000` หากใช้ port อื่น
การเข้าสู่ระบบฝั่งเซลล์ผ่าน Microsoft จะไม่ทำงาน `scripts/check-dev.mjs` ตรวจให้ก่อนเริ่มระบบแล้ว
(ถ้าใช้ port อื่นจริง ๆ ให้ใช้ทางเข้า dev ใน §6.1 แทน)

### 1.2 npm scripts ทั้งหมด (`package.json`)

| script | คำสั่งจริง | ใช้เมื่อ |
|---|---|---|
| `dev` | `check-dev.mjs` → `next dev -p 3000` | พัฒนา |
| `dev:turbo` | เหมือน `dev` + `--turbopack` | ลองใช้ turbopack |
| `dev:stop` | `scripts/stop-dev.mjs` | ปิด process ที่ฟัง port 3000 (Windows) — **ก่อน build ทุกครั้ง** |
| `clean` | ลบ `.next/` | cache ของ Next เพี้ยน |
| `build` · `start` | `next build` · `next start` | build / รัน production บนเครื่อง |
| `lint` | `next lint` | ตรวจ ESLint |
| `test` · `test:watch` | `vitest run` · `vitest` | เทสต์ |
| `db:generate` | `prisma generate` | หลังแก้ schema (ปกติ `db:migrate` ทำให้แล้ว) |
| `db:migrate` | `prisma migrate dev` | **ทางเดียวที่ใช้เปลี่ยน schema** (§3.2) |
| `db:seed` · `db:setup` | `tsx prisma/seed.ts` · migrate dev + seed | ดูคำเตือนข้างบน |
| `backup:db` | `scripts/backup-db.mjs` | สำรอง SQLite ด้วย `VACUUM INTO` |
| `sync:masters` | `scripts/sync-fabric-masters.ts` (`-- --interactive` ได้) | ดึง master จาก OneLake |
| `sync:masters:daily` | `scripts/sync-masters-daily.bat` | Windows Task Scheduler |
| `probe:stock-onelake` · `probe:promo-cash` · `probe:region-promos` | สคริปต์ `probe-*` | สำรวจไฟล์/สิทธิ์ต้นทาง |
| `snapshot:promo` · `verify:promo-context` · `verify:promo-parity` · `verify:sales-cover` | สคริปต์ตรวจโปร/ยอดขาย | ตรวจหลัง sync หรือเปลี่ยนไฟล์ต้นทาง |
| `erp:preview` | `scripts/erp-payload-preview.ts` | เขียน payload ERP ลง `logs/erp-preview/` — **ไม่ยิง** |
| `postinstall` | `prisma generate` | อัตโนมัติ |

สคริปต์ที่ไม่มี npm script (`probe-cross-target`, `probe-sold-history`, `create-demo-erp-order`,
`repair-new-sku-flags`) รันด้วย `npx tsx --env-file=.env scripts/<ไฟล์>.ts` — รายละเอียดใน [12](./12-project-structure.md) §9

### 1.3 ตัวแปรสภาพแวดล้อม

**นโยบายของโปรเจกต์: คอนฟิกอยู่ในโค้ด ไม่ใช่ `.env` เท่าที่ทำได้** — ผู้ใช้ไม่ต้องการแก้ env บน server
แล้ว restart อีก ตัวอย่างที่ย้ายเข้าโค้ดแล้ว: Azure client/tenant id (`lib/auth/azure-app.ts`), ปลายทาง ERP
(`lib/po/erp-endpoint.ts`), ชื่อไฟล์/ที่อยู่ของทุก dataset (`lib/fabric/datasets.ts`), ทะเบียนคลัง VDA
(ตาราง `VdaWarehouse` แก้ที่หน้า `/admin/data/warehouses`) · ค่าใน `.env` **ชนะโค้ดเสมอและเงียบเวลาตั้งผิด**

ที่ต้องตั้งจริง (ตามหัวไฟล์ `.env.example`): `DATABASE_URL` · `NEXTAUTH_SECRET` · `ADMIN_EMAILS` ·
`ALERT_EMAIL` + `SENDER_EMAIL` · `DATA_SOURCE=fabric` · `ONELAKE_{TENANT,CLIENT,CLIENT_SECRET,WORKSPACE,LAKEHOUSE}_ID` ·
`STOCK_ONELAKE_*` ชุดเดียวกัน · `VDA_CUSTOMER_MAP` (seed ทะเบียนคลังครั้งแรกเท่านั้น) · `MASTER_REFRESH_ENABLED/HOUR/MINUTE`

ตัวแปรที่โค้ดอ่านแต่ **ไม่มีใน `.env.example`**:

| ตัวแปร | อ่านที่ | ความหมาย |
|---|---|---|
| `DEV_LOGIN=1` | `app/api/dev/login/route.ts` | เปิดทางเข้า dev (§6.1) — ห้ามตั้งบน server |
| `ERP_SEND_DISABLED=1` | `lib/po/erp-endpoint.ts` (+ route PO) | เบรกฉุกเฉิน ปิดการส่ง ERP (§7) — **ตั้งไว้เสมอบนเครื่อง dev** |
| `VDA_SALESMAN_MAP=vda1:S555,…` | `lib/auth/sales-session.ts`, `lib/admin/vda-sales-directory.ts`, `preview-sales` | ทะเบียน VDA → รหัสเซลล์สำรองเมื่อไม่มีไฟล์ `cross_target` |
| `VMI_BACKUP_ON_START` | `docker/entrypoint.sh` | สำรองก่อน migrate ตอน container start (default `true`) |
| `BACKUP_KEEP` | `scripts/backup-db.mjs` | จำนวนไฟล์สำรองที่เก็บ (default 14) |
| `PROMO_COVERAGE_DROP_ALERT_PCT` | `lib/fabric/promo-coverage.ts` | โปรหายเกินกี่ % ถึงเตือน (default 30) |
| `*_CSV` (`CUSTOMER_MASTER_CSV`, `SKU_MASTER_CSV`, `STOCK_COVER_CSV`, `SOLD_HISTORY_CSV`, `CROSS_TARGET_CSV`, `SALESMAN_CSV`) | `lib/fabric/paths.ts` | ชี้ไฟล์ในเครื่องเองแทน `data/cache/…` |
| `STOCK_COVER_FROM_DB` · `STOCK_FROM_DB_DEFAULT` · `STOCK_FROM_DB_OPTIONS` · `STOCK_VDA_PREFIX` · `STOCK_COVER_STORE_COLUMN` | `lib/fabric/stock-filter-config.ts`, `stock-cover.ts` | ปรับตัวกรองแหล่งสต็อก — ปกติไม่ต้องตั้ง |
| `EXPORT_FONT` | `lib/stock/export-order-form.ts` | ฟอนต์ใน Excel (default Browallia New) |

---

## 2. หลักการสำคัญ

ทำความเข้าใจหลักการเหล่านี้ก่อน จะช่วยให้อ่านโค้ดส่วนที่เหลือได้เร็วขึ้นมาก

### 2.1 ข้อมูลแบ่งเป็น 2 ประเภท และต้องไม่ปะปนกัน

| ประเภท | แหล่งที่มา | สิทธิ์การเขียน | จัดเก็บที่ |
|---|---|---|---|
| **Master** — สินค้า ราคา โปรโมชัน ยอดขาย ลูกค้า เป้าขาย | Microsoft Fabric (OneLake) | **อ่านอย่างเดียว** | ไฟล์ CSV ใน `data/cache/` แล้วนำเข้าหน่วยความจำ |
| **Transaction** — ออเดอร์ PO บัญชีร้าน MIN/MAX การแจ้งเตือน ทะเบียนคลัง/เซลล์ audit log | ระบบนี้สร้างขึ้นเอง | เขียนได้ | SQLite ผ่าน Prisma |

หากพบโค้ดที่พยายามเขียนข้อมูลกลับไปยังฝั่ง master ถือว่าผิดหลักการ เนื่องจากข้อมูล master
จะถูกดึงมาทับใหม่ทุกคืนในรอบ sync

### 2.2 ค่าที่ใช้ประกอบการตัดสินใจต้องบันทึกไว้ ไม่คำนวณใหม่ขณะอ่าน

เมื่อร้านค้ากดส่งออเดอร์ ระบบจะบันทึกราคา C4 ส่วนลด โปรโมชัน ของแถม และค่า MIN/MAX
ลงใน `OrderItem` ทันที

เนื่องจากราคาและโปรโมชันเปลี่ยนแปลงทุกวัน หากคำนวณใหม่ขณะเปิดดูออเดอร์ย้อนหลัง
ตัวเลขจะไม่ตรงกับที่ร้านค้าเห็นขณะตัดสินใจ ทำให้ไม่สามารถตรวจสอบย้อนหลังได้
และสถานะธงราคาจะเปลี่ยนไปมา

ฟิลด์ที่ขึ้นต้นด้วย `c4` ใน `OrderItem` คือข้อมูลชุดนี้ **ห้ามเปลี่ยนไปใช้การคำนวณสด**

### 2.3 ตัวตนของร้านค้าต้องมาจาก session ที่ลงลายเซ็นแล้วเท่านั้น

```ts
// ถูกต้อง — เป็นช่องทางเดียวที่อนุญาต
import { getAuthorizedStore } from "@/lib/auth/store-context";
const authorized = await getAuthorizedStore();
if (!authorized) return NextResponse.json({ error: "..." }, { status: 401 });

// ห้ามใช้ — cookie นี้เป็นค่า cuid ที่ไม่ได้ลงลายเซ็น สามารถปลอมแปลงได้
const storeId = cookieStore.get("vmi_store_id")?.value;
```

cookie `vmi_store_id` มีคุณสมบัติ httpOnly ซึ่งป้องกันการเข้าถึงจาก JavaScript ได้
แต่ไม่สามารถป้องกัน HTTP request ที่ประกอบขึ้นเองได้ `middleware.ts` (Edge) เช็คแค่ว่า "มี cookie"
เพื่อ redirect ไปหน้า login — ตัวตนจริงตัดสินฝั่ง server เสมอ

### 2.4 basePath คือ `/vmi` — ห้ามประกอบ URL เอง

```ts
import { appPath } from "@/lib/paths";
apiFetch(appPath("/api/stock"));   // ถูกต้อง — ได้ /vmi/api/stock
fetch("/api/stock");               // ผิด — จะได้ 404 บน production (ESLint จับให้แล้ว)
```

ฝั่ง client ให้ใช้ `apiFetch` แทน `fetch` เนื่องจาก `apiFetch` จะส่ง `UnauthorizedError`
เมื่อได้รับสถานะ 401 และตัวจัดการส่วนกลางใน `components/providers.tsx` จะนำผู้ใช้
ไปยังหน้าเข้าสู่ระบบให้

`usePathname()` ตัด basePath ออกให้แล้วแต่ **ไม่ตัด `/` ปิดท้าย** (`trailingSlash: true`) — เทียบ path
ด้วย `normalizePathname()` / `isPathUnder()` จาก `lib/paths.ts` เสมอ

### 2.5 ห้ามใช้กล่องโต้ตอบของเบราว์เซอร์

`window.confirm()` `alert()` และ `prompt()` หยุด main thread ทั้งหน้าไว้จนกว่าจะมีผู้ตอบ
และเมื่อระบบถูกเปิดผ่าน webview กล่องอาจไม่ปรากฏให้ผู้ใช้เห็นเลย อาการที่ผู้ใช้พบคือ
"กดปุ่มแล้วหน้าเว็บค้าง" ซึ่งเคยเกิดขึ้นจริงในหน้า `/manage`

ให้ใช้ `ConfirmDialog` สำหรับการยืนยัน และ `Modal` สำหรับกล่องทั่วไป ทั้งสองตัวอยู่ใน
`components/ui` และผูกกับ `hooks/use-focus-trap.ts` ให้แล้ว

หากจำเป็นต้องเขียน portal ขึ้นเองจริง ๆ (เช่น `C4PromoModal` และ `PoDetailPanel` ที่มี
โครงเฉพาะตัว) ต้องเรียก `useFocusTrap(ref, open)` ด้วยตนเอง

### 2.6 การแจ้งเตือนและ audit log ต้องไม่ทำให้งานหลักล้มเหลว

`notifyStore()` `notifySales()` `notifyErpSendResult()` และ `recordAudit()` ดักจับข้อผิดพลาดไว้ภายในตัวเอง
(log ด้วย `console.warn`) หากการบันทึกล้มเหลว การอนุมัติ/ลบ/ส่งต้องยังตอบว่าสำเร็จ
**เรียกหลังการกระทำสำเร็จเท่านั้น และอย่าห่อด้วยโค้ดที่ส่ง error ต่อออกมา** · helper ใหม่แนวนี้ต้องไม่ `throw`

### 2.7 สิทธิ์แบบ fail-closed

- ตำแหน่ง: **Creator** = อีเมลใน `ADMIN_EMAILS` (session `role: "admin"`) · **Admin** = อีเมลในตาราง `Admin`
  (session `role: "sales"` + `adminAccess: "admin"`) · **เซลล์** = อีเมลที่ผูกรหัสใน `SalesmanEmailAssignment`
- ตัดสินที่ `lib/auth/permissions.ts` เท่านั้น (`can(session, "stores.view")` ฯลฯ) — Admin ได้เฉพาะสิทธิ์ใน
  `ADMIN_PERMISSIONS` · จุดที่ลืมตรวจต้องกลายเป็น "ทำไม่ได้" ไม่ใช่ "ได้สิทธิ์เกิน"
- หมวดหน้าแอดมินที่ creator เท่านั้นกันด้วย `components/admin/creator-only-layout.tsx` ใน `layout.tsx` **และ**
  API ต้องตรวจซ้ำเอง (อย่าพึ่งการซ่อนเมนู)
- มุมมองทดสอบเซลล์ = อ่านอย่างเดียว — route ที่เขียนข้อมูลต้องเรียก `salesPreviewReadOnly(session)`
- เซลล์เห็นออเดอร์เฉพาะ VDA ที่ดูแล — ตรวจด้วย `assertOrderAccess()` / `resolveOrderStoreScope()` (`lib/orders/access.ts`)
- ไม่มี VDA ในความดูแล = ไม่เห็นอะไร (ห้ามถอยไปใช้ค่าอื่น เช่น `Store.salesRep` เดิม)

### 2.8 เปลี่ยนสถานะด้วย compare-and-set

ทุกการเปลี่ยนสถานะที่แข่งกันได้ใช้ `updateMany({ where: { id, status: <สถานะที่คาด> } })` แล้วดู `count`
ไม่ใช่อ่านก่อนแล้วค่อยเขียน — ตัวอย่าง: จองสิทธิ์อนุมัติ (`approve-with-split.ts`), ประทับผล ERP
(`stampErpSuccess/Failure` ด้วย `erpSentAt: null`), `resolveAmbiguousErpResult` (ได้ `CHANGED` ถ้าถูกแก้ระหว่างทาง)

### 2.9 สไตล์โค้ดที่เห็นในโปรเจกต์

- คอมเมนต์ภาษาไทยอธิบาย **"ทำไม"** พร้อมวันที่/เหตุการณ์ที่เป็นที่มา (เช่น "QA 28 ก.ย. 69") — เขียนต่อแบบเดียวกัน
  และแก้คอมเมนต์ให้ตรงเมื่อพฤติกรรมเปลี่ยน
- แยก logic ล้วนออกจากไฟล์ที่ import Prisma (`*-display.ts`, `audit-log-labels.ts`, `password-rules.ts`,
  `threshold-defaults.ts`) เพื่อให้ client component และเทสต์ import ได้
- ตรวจ input ด้วย zod และตอบ error เป็นข้อความไทยที่ผู้ใช้อ่านรู้เรื่อง (`lib/error-message.ts` ฝั่ง client)
- ค่า "แหล่งความจริงเดียว" ประกาศครั้งเดียวแล้วอ้างถึง (สถานะ PO, เมนูแอดมิน, dataset) — อย่าพิมพ์สตริงซ้ำ

---

## 3. โครงสร้างโค้ดและฐานข้อมูล

แผนที่ไฟล์ละเอียด + request flow อยู่ที่ [12 — แผนที่โครงสร้างโปรเจกต์](./12-project-structure.md)

```
app/            หน้าเว็บ (ร้าน: stock order history manage · เซลล์: sales/* · แอดมิน: admin/*) + app/api/**
components/     UI ทั้งหมด — ตรรกะหลักอยู่ใน lib
lib/            auth · fabric · po · promo · orders · calculations · stock · sales · admin · repositories
hooks/          React hooks ฝั่ง client
prisma/         schema, migrations, seed
scripts/        sync, backup, verify, probe
tests/          Vitest · helpers/test-db.ts
```

### 3.1 ตารางค้นหาตำแหน่งโค้ด

| ต้องการแก้ไข | ตำแหน่งไฟล์ |
|---|---|
| สิทธิ์ Creator / Admin | `lib/auth/permissions.ts` (ADMIN_PERMISSIONS) · หมวดที่ creator เท่านั้น `components/admin/creator-only-layout.tsx` |
| สูตรธง CVD (เขียว/เหลือง/แดง) | `lib/calculations/index.ts` → `getCvdFlag`, `getOrderCvdFlag` |
| จำนวนที่ระบบแนะนำให้สั่ง | `lib/calculations` → `calcSuggestOrder` และ `lib/promo/promo-step.ts` (ปัดขึ้นโดยตั้งใจ) |
| ลำดับความสำคัญของราคา | `lib/calculations/price-override.ts` → `resolveOrderLinePrice` |
| กฎการแบ่งใบ PO | `lib/po/split-plan.ts` |
| ขั้นตอนการอนุมัติ (ออกเลข เขียนไฟล์ เปลี่ยนสถานะ) | `lib/po/approve-with-split.ts` |
| อนุมัติเฉพาะบางรายการ | `lib/po/approve-selected.ts` · client `partialItems` / `promoSiblings` ใน `sales-orders-client.tsx` |
| ชุดค่าสถานะ PO | `lib/po/po-status.ts` — ไฟล์เดียว ไม่ต้อง migrate |
| ส่ง ERP / payload / ขอเลขใหม่ / แก้ "ERP ไม่ตอบ" | `lib/po/erp-delivery.ts` · `erp-payload.ts` · `clone-for-erp.ts` · `erp-resolve.ts` · UI `components/sales/po-detail-panel.tsx` |
| ของแถมและกลุ่มโปรโมชัน | `lib/promo/order-free-goods.ts` |
| สิทธิ์ของเซลล์ในการเห็นออเดอร์ | `lib/orders/access.ts` |
| รายการตารางที่ sync จาก Fabric | `lib/fabric/datasets.ts` |
| ตารางสต็อกบนหน้าจอ | `components/stock/stock-page-client.tsx` (ไฟล์ขนาดใหญ่) |
| โครงเมนูและเส้นทางหน้าผู้ดูแลระบบ | `lib/admin/admin-nav.ts` |
| บันทึกการทำงาน (audit log) | เขียน `recordAudit()` ใน `lib/admin/audit-log.ts` · ป้าย `lib/admin/audit-log-labels.ts` · UI `components/admin/audit-log-section.tsx` |
| หน้าภาพรวมฝั่งเซลล์ | `lib/sales/dashboard-{summary,queries}.ts` และ `app/api/sales/dashboard` |
| พนักงานเพิ่มสินค้าใหม่เข้าออเดอร์ / ร้านปฏิเสธแล้วลบแถว | `lib/po/add-order-item.ts` (`addOrderItem`, `removeRejectedAddedItem`, `computePooledGroup`) |
| ค้นสินค้าทั้งแคตตาล็อก | `lib/fabric/sku-master.ts` → `searchRanked` · UI `components/sales/sku-picker.tsx` |
| รอร้านยืนยันเพิ่มจำนวน (D3) | `lib/repositories/prisma-repository.ts` → `updateOrderItemQty` / `confirmQtyIncrease` / `rejectQtyIncrease` · route `app/api/store/orders/route.ts` (PATCH) |
| กันอนุมัติขณะรอร้านยืนยัน | server: `app/api/orders/route.ts` (action `approve`) · client: `pendingConfirmCount` ใน `components/sales/sales-orders-client.tsx` |
| อีเมล ↔ รหัสเซลล์ที่แอดมินกำหนด | `lib/auth/manual-salesman-assignments.ts` + `buildSalesSessionWithAccess` ใน `lib/auth/sales-session.ts` · หน้าจอ `components/admin/sales-code-directory-panel.tsx` (ข้อมูลจาก `lib/admin/vda-sales-directory.ts`) · API `app/api/admin/salesman-assignments` |
| กรองออเดอร์ตามรหัสเซลล์ (creator) | `components/sales/sales-code-filter.tsx` + `app/api/admin/sales-codes` · param `salesCode` ของ `GET /api/orders` |
| ทะเบียนคลัง VDA | `lib/fabric/vda-warehouse-registry.ts` · หน้า `/admin/data/warehouses` · API `app/api/admin/vda-warehouses` |
| เคลียร์สิ้นเดือน (ทั้งใบ / เฉพาะสินค้า) | UI `components/sales/month-end-clear-modal.tsx` · API `DELETE /api/orders` + `app/api/orders/clear-sku/route.ts` |
| ย้ายรายการข้าม PO / รวมเป็นใบเดียว | `assignmentsFor` + ปุ่มใน `components/sales/po-split-panel.tsx` |
| ราคา/มูลค่าในตารางตรวจออเดอร์ | `linePrice` ใน `components/sales/order-review-table.tsx` — ค่าที่แช่ไว้ ตรงกับ `toSplittable` / เอกสาร PO |
| เลย์เอาต์หน้าตรวจออเดอร์บนจอคอม (เลื่อนทั้งหน้า, sticky) | `app/globals.css` บล็อก "หน้าตรวจออเดอร์บนจอกว้าง" |
| กระดิ่งร้าน → เปิดออเดอร์ | `components/layout/store-notification-bell.tsx` (`openOrder`) + `?order=` ใน `components/history/order-history-client.tsx` |
| กระดิ่งเซลล์ → เปิดออเดอร์ | `components/layout/sales-notification-bell.tsx` + `?order=&status=` ใน `components/sales/sales-orders-client.tsx` · ป้ายชนิด `lib/orders/sales-notify-display.ts` |

### 3.2 การเปลี่ยน schema — ต้องมี migration จริงเสมอ

```bash
# 1. แก้ prisma/schema.prisma
npm run db:migrate -- --name <ชื่อสั้น_snake_case>   # = prisma migrate dev → ได้ prisma/migrations/<timestamp>_<ชื่อ>/migration.sql
# 2. commit ทั้ง schema.prisma และโฟลเดอร์ migration ใหม่
```

- **ห้าม `prisma db push`** กับฐานข้อมูล dev/production — push ไม่สร้างไฟล์ migration แต่ production รัน
  `npx prisma migrate deploy` ใน `docker/entrypoint.sh` ตอน container start ⇒ คอลัมน์ใหม่ไม่มี แล้วตอบ 500
  (`db push` ใช้ได้ที่เดียวคือฐานข้อมูลชั่วคราวของเทสต์ใน `tests/helpers/test-db.ts`)
- ชื่อ migration เป็นแบบ Prisma `YYYYMMDDHHMMSS_snake_case` · data migration เขียนมือได้ (ตัวอย่าง
  `20260826080500_seed_vda_warehouses`)
- migration ที่ลบ/เปลี่ยนคอลัมน์ย้อนกลับไม่ได้ — entrypoint สำรองก่อน migrate ให้แล้ว (`VMI_BACKUP_ON_START`)
- ตาราง `SalesRep` และ `Store.salesRepId` **คงไว้แต่ไม่ใช้แล้ว** (ไม่มีโค้ดอ่าน) — ลบได้ในรอบที่มี migration อื่นอยู่แล้ว
- เพิ่มคอลัมน์ที่เป็นความลับ ให้ดูกติกาการซ่อนใน `lib/admin/db-explorer.ts` (หน้า "ดูข้อมูลดิบ" อ่านคอลัมน์จาก schema อัตโนมัติ)

### 3.3 โครงสร้างหน้าผู้ดูแลระบบ

แบ่งเป็น 5 หมวด ได้แก่ `/admin/data/{sync,raw,warehouses}` · `/admin/stores/{accounts,thresholds}` ·
`/admin/promotions/c4` · `/admin/preview/{vda,sales}` · `/admin/system/{admins,vda-sales,audit}`

Admin (ไม่ใช่ creator) เห็นเฉพาะ `stores/accounts`, `promotions/c4`, `system/vda-sales` (ตาม `permission`
ของแท็บ) · URL รูปแบบเดิม เช่น `/admin/sync` `/admin/vda` (→ `/admin/preview/vda`) ยังใช้งานได้ผ่าน
`ADMIN_LEGACY_REDIRECTS` — **เมื่อเพิ่มหรือย้ายหน้าต้องปรับรายการนี้ด้วย** มีชุดทดสอบ (`tests/admin-nav.test.ts`)
ตรวจว่าทุกค่าชี้ไปยังหน้าที่มีอยู่จริง

---

## 4. ข้อควรระวังที่เคยก่อให้เกิดปัญหาจริง

รายการต่อไปนี้เป็นข้อผิดพลาดที่เกิดขึ้นจริงในระบบ ไม่ใช่กรณีสมมติ

### 4.1 โปรโมชันแบบกลุ่ม — ของแถมปรากฏในทุกบรรทัด

โปรโมชันที่รวมยอดข้าม SKU จะส่งข้อมูล `freeGood` **ชุดเดียวกัน** มาพร้อมกับทุกบรรทัดในกลุ่ม
เนื่องจากของแถมเป็นสิทธิ์ของ *กลุ่ม* ไม่ใช่ของแต่ละบรรทัด

หากนำมารวมโดยตรง จำนวนของแถมจะถูกคูณตามจำนวนสมาชิกในกลุ่ม (กรณีจริงคือกลุ่ม `BSWM`
ที่ควรได้รับ 600 ชิ้น แต่การรวมโดยตรงให้ผลลัพธ์ 3,000 ชิ้น)

**ต้องรวมยอดผ่าน `collectOwedFreeGoods()` เท่านั้น** ห้ามเขียน `.reduce()` ขึ้นใหม่

### 4.2 การแยกบรรทัดในกลุ่มโปรโมชัน ทำให้ราคาบนเอกสารผิดพลาด

หากนำสมาชิกของกลุ่มออกจากใบสั่งซื้อ บรรทัดที่เหลือจะยังคงถือข้อมูล
`c4PromoGroupMembers` `c4PooledQty` และ `c4DiscountBaht` ของกลุ่มเต็มซึ่งไม่เป็นจริงแล้ว
ส่งผลให้ส่วนลดที่พิมพ์ลงเอกสารเป็นส่วนลดที่ร้านค้าไม่ได้รับจริง

"อนุมัติเฉพาะบางรายการ" (A1b) จึงทำแบบ **รายการที่ไม่เลือกย้ายเป็นออเดอร์ใหม่** และ **กลุ่มโปรต้องเลือกทั้งกลุ่ม**
(`checkPromoGroupSelection` ใน `lib/po/approve-selected.ts`) — ห้ามเปิดให้เลือกครึ่งกลุ่ม

บรรทัดที่มีจำนวนเป็น 0 จะถูกตัดออกจากเอกสาร **เฉพาะกรณีที่ไม่ได้อยู่ในกลุ่มโปรโมชัน**
ส่วนบรรทัดที่อยู่ในกลุ่มจะคงไว้พร้อมหมายเหตุสำหรับผู้ตรวจสอบ

### 4.3 การอนุมัติต้องจองสิทธิ์ก่อนดำเนินการใด ๆ

`approveWithPoSplit` ทำงานตามลำดับต่อไปนี้ และ**ห้ามสลับลำดับ**

```
ตรวจสอบ → จองสิทธิ์ (compare-and-set) → ออกเลข PO → เขียนไฟล์ → สร้างระเบียน PO
```

เลขที่ PO ไม่สามารถนำกลับมาใช้ซ้ำได้ และไฟล์เอกสารถูกเขียนลงดิสก์จริง
หากใช้รูปแบบอ่านสถานะก่อนแล้วจึงเขียน (read-then-act) ผู้ใช้สองคนที่กดอนุมัติพร้อมกัน
จะผ่านขั้นตอนการอ่านทั้งคู่ ต่างฝ่ายต่างออกเลขที่ PO แล้วมีไฟล์เอกสารตกค้างในระบบ

มีชุดทดสอบครอบคลุมที่ `tests/approve-with-split.db.test.ts`

### 4.4 `decidedBy` เป็น `String @default("")` ไม่ใช่ค่าที่รับ null ได้

การเขียนค่า `null` ลงในฟิลด์นี้จะทำให้ `updateMany` เกิดข้อผิดพลาด และหากข้อผิดพลาดนั้น
เกิดขึ้นภายในบล็อก rollback **ออเดอร์จะค้างอยู่ในสถานะ `approved` โดยไม่มี PO**

### 4.5 ข้อมูลยอดขายย้อนหลังมีเพียง 30 วัน ไม่ใช่ 120 วัน

ค่า `MAX_DAYS_KEPT = 120` ใน `lib/fabric/sold-history.ts` เป็นเพดานของฝั่งระบบนี้
แต่ **ข้อมูลจากต้นทางมีเพียง 30 วัน** (Fabric notebook กำหนด `LOOKBACK_DAYS = 30` และเขียนทับทุกคืน)

**ให้ใช้ `summary.effectiveDays` เป็นตัวหารเสมอ ห้ามใช้จำนวนวันที่ผู้ใช้ร้องขอ** (`clampWindowToCoverage()`)

### 4.6 `npm run build` แจ้งว่าไม่พบโมดูลทั้งที่โค้ดถูกต้อง

สาเหตุคือ `npm run dev` ยังทำงานอยู่ — ทั้งสองคำสั่งใช้โฟลเดอร์ `.next/` ร่วมกัน

```bash
npm run dev:stop && npm run build
```

**ไม่ควรเสียเวลาตรวจสอบไฟล์ที่ข้อความแสดงข้อผิดพลาดอ้างถึง** · build เสร็จแล้วจะรัน `npm run dev` ต่อ
ก็ทับ `.next/` อีกรอบเช่นกัน (ถ้าเพี้ยน `npm run clean`)

### 4.7 การยกเลิกออเดอร์โดยร้านค้าคือการลบระเบียน

`app/api/store/orders/route.ts` ใช้ `prisma.order.delete()` ไม่ใช่การเปลี่ยนสถานะ
จึงไม่มีออเดอร์สถานะ `"cancelled"` ในฐานข้อมูล และออเดอร์ที่ร้านยกเลิกจะ**ไม่ปรากฏในสถิติทุกประเภท**

### 4.8 การอ่านไฟล์ CSV ต้องใช้ตัวอ่านของโปรเจกต์

`lib/fabric/csv.ts` รองรับเครื่องหมาย `"` ที่ปรากฏกลางค่าข้อมูล เช่น หน่วยวัดนิ้ว (`12" x 4"`)
เคยเกิดกรณีข้อมูล SKU หายไป 15 รายการจากการแยกด้วย `,` ตรง ๆ และเคยกลืนแถวติดกัน — มีชุดทดสอบครอบคลุมแล้ว

### 4.9 แก้บรรทัดในโปรกลุ่มหลังร้านส่งแล้ว ต้องคิดพี่น้องใหม่ทั้งกลุ่ม

`lookupC4` คิด `pooledQty` จากเฉพาะบรรทัดที่ส่งเข้าไปในคำเรียกเดียวกัน · เพิ่มหรือลบบรรทัดในกลุ่ม
โดยไม่ส่งพี่น้องเข้าไปด้วย = ส่วนลดของทั้งกลุ่มผิดเงียบ ๆ ใช้ `computePooledGroup()`
ใน `lib/po/add-order-item.ts` และอัปเดตเฉพาะฟิลด์ pooled — **ห้ามแตะราคา/`priceFlagged` ของพี่น้อง**

### 4.10 `requestedQty = 0` มีความหมายพิเศษ

`0` = พนักงานเพิ่มสินค้านี้เอง ร้านไม่เคยสั่ง (ต่างจาก `null` = ออเดอร์เก่า) หลายจุดแยกพฤติกรรมด้วยค่านี้:
ข้อความแถบยืนยันใน `/history`, ป้าย `PendingQtyIncreaseBadge newItem`, ชนิดแจ้งเตือน `item_added_*`,
และการปฏิเสธ = ลบแถว · อย่าเปลี่ยนค่าเริ่มต้นของ `requestedQty` ตอนสร้างออเดอร์ให้เป็น 0

### 4.11 ตารางที่เลื่อนแนวนอนบนมือถือ + ปุ่มในแถว `colSpan`

ปุ่มที่ `justify-between` ในตารางกว้างไปอยู่ขวาสุด **นอกจอมือถือ** (พบ 25 ก.ย. 2569) · แก้ด้วย `sticky left-*` +
`max-w-[calc(100vw-…)]` บน div ข้างใน `td` — ตรวจจอ 390px ทุกครั้งที่ใส่ปุ่มในแถวตาราง ·
ข้อความในตารางที่ล้น/ตกบรรทัด/ขาดหายถือเป็นบั๊ก

### 4.12 ด่านกันกลุ่มโปรแตก PO — ต้องส่ง promoGroup เสมอ

`validatePoSplit()` กฎข้อ 1 เคยไม่ทำงานเพราะไม่มีผู้เรียกส่ง `promoGroup` · ถ้าเพิ่มผู้เรียกใหม่ต้องส่ง
`promoGroup` / `promoGroupMembers` ด้วย ไม่งั้นด่านเงียบอีก

### 4.13 sticky ภายใต้ `overflow:hidden` ไม่ติดจอ

บรรพบุรุษตัวไหนเป็น `overflow: hidden|auto` sticky จะยึดกับกล่องนั้นแทนจอ · ใช้ `overflow: clip` แทนเมื่อแค่ต้องตัดขอบ ·
`.vmi-sales-orders-sidebar` ตั้ง `display:flex` ไว้หลัง utility ทำให้ `xl:hidden` บน aside ไม่มีผล ใช้ CSS class แทน

### 4.14 เอกสาร PO เขียนลง `<cwd>/logs/po-export` เสมอ

`writePoDocument` ไม่มี env ให้เปลี่ยน path — dev server, สคริปต์ และเทสต์ที่รันจากราก repo เขียนลงโฟลเดอร์เดียวกัน
เทสต์ที่อนุมัติออเดอร์จึงต้อง `process.chdir()` ไป temp (§5) ไม่งั้นไฟล์เทสต์ปนกับเอกสารจริง ·
ไฟล์หายไม่เป็นไร `rebuildPoDocumentFromDb` ประกอบใหม่จาก DB ได้

---

## 5. การทดสอบ

```bash
npm test                                  # vitest run — 59 ไฟล์ (logic 44 + db 15) · 29 ก.ย. 2569
npx vitest run --no-file-parallelism      # เครื่องช้า / มี dev server รันอยู่ แล้ว *.db.test.ts หมดเวลาตอนเตรียม DB
npx vitest run tests/cvd-flag.test.ts     # ระบุเฉพาะไฟล์
npm run test:watch
```

### 5.1 แนวทางการเขียนชุดทดสอบ

ทดสอบเฉพาะ **ตรรกะล้วน** ที่มีผลกระทบสูงเมื่อทำงานผิดพลาด โดยไม่ครอบคลุม component
และ API route (ต้องอาศัย DOM หรือฐานข้อมูล ช้าและเปราะ) — ส่วนที่คุ้มที่สุดคือสูตรคำนวณและกฎธุรกิจที่เคยพัง
ดังนั้นตรรกะที่อยากเทสต์ให้ย้ายออกจาก route มาไว้ใน `lib/` ก่อน (เช่น `lib/po/erp-notify.ts`, `lib/orders/item-edit.ts`)

**ข้อยกเว้นเดียว** คือไฟล์ `*.db.test.ts` ซึ่งใช้ SQLite ชั่วคราวได้ สำหรับตรรกะระดับ `lib/`
ที่เป็นทรานแซกชันจริง เช่น การอนุมัติพร้อมกัน โดยยังคงห้ามใช้กับ API route และ component

### 5.2 การเขียนชุดทดสอบที่ต้องใช้ฐานข้อมูล

```ts
import { createTestDatabase, setTestDatabaseUrl, seedPendingOrder } from "./helpers/test-db";

const db = createTestDatabase("ชื่องาน");   // ไฟล์ใน os.tmpdir() + prisma db push
setTestDatabaseUrl(db.url);                // ต้องเรียกก่อน import โมดูลที่จะทดสอบ

// ถ้าโค้ดเขียนเอกสาร PO (approveWithPoSplit, approveSelectedItems, cloneRejectedPoForErp)
const poExportDir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-po-"));
process.chdir(poExportDir);                // writePoDocument เขียน <cwd>/logs/po-export

const { approveWithPoSplit } = await import("@/lib/po/approve-with-split");
```

- `lib/prisma.ts` อ่าน `DATABASE_URL` ขณะสร้าง client เพียงครั้งเดียว หาก import ก่อนกำหนดค่า
  ชุดทดสอบจะเขียนลงฐานข้อมูลสำหรับพัฒนาจริง
- ถ้าโค้ดที่ทดสอบต้องใช้ master/โปรจาก Fabric ให้ `vi.doMock("@/lib/fabric", …)` ก่อน import
  (ตัวอย่างใน `tests/add-order-item.db.test.ts`)
- ตัวอย่าง chdir: `tests/approve-with-split.db.test.ts`, `approve-selected.db.test.ts`, `erp-clone.db.test.ts`
- เทสต์ ERP ไม่ยิงเน็ต — `postErpPayload` รับ `fetch` เข้ามาได้ และ `stampErp*` แตะแค่ DB

> รันทั้งชุดตอนเครื่องทำงานหนัก (เช่นพร้อม `next build`) บางครั้ง `.db.test.ts` สร้างฐานข้อมูล
> ชั่วคราวไม่ทันแล้วล้มพร้อมกันหลายไฟล์ (เห็นเป็น "skipped" จำนวนมาก) — รันซ้ำด้วย
> `--no-file-parallelism` ก่อนไล่หาบั๊ก

---

## 6. ขั้นตอนการทำงานที่พบบ่อย

### 6.1 เข้าใช้ทุกตำแหน่งบนเครื่องตัวเอง (ไม่ต้องผ่าน Microsoft)

```bash
# .env บนเครื่อง dev เท่านั้น — ห้ามคัดลอกขึ้น server
DEV_LOGIN=1                              # เปิด GET /api/dev/login/?email=<อีเมล>
VDA_SALESMAN_MAP=vda1:S555,vda2:S777     # ทะเบียน VDA → รหัสเซลล์สำรอง เมื่อไม่มีไฟล์ cross_target ในเครื่อง
ERP_SEND_DISABLED=1                      # เบรก — ห้ามยิง ERP จากเครื่อง dev (ปิดได้อย่างเดียว)
```

แล้วเปิด `http://localhost:3000/vmi/api/dev/login/?email=<อีเมล>` — พฤติกรรมจริงของ `app/api/dev/login/route.ts`:

| หัวข้อ | รายละเอียด |
|---|---|
| เปิดเมื่อ | ครบ 3 ข้อ: `NODE_ENV !== "production"` (คือ `npm run dev` — `next start` ใช้ไม่ได้) · `DEV_LOGIN=1` · host เป็น `localhost` / `127.0.0.1` / `[::1]` · ไม่ครบ = 404 |
| ได้อะไร | cookie `vmi_sales_session` (อายุ 8 ชม.) ที่สร้างด้วย `buildSalesSessionWithAccess` ตัวจริง แล้ว redirect ไป `homePathFor(session)` |
| ตำแหน่งที่ได้ | Creator = อีเมลใน `ADMIN_EMAILS` · Admin = อีเมลในตาราง `Admin` · เซลล์ = อีเมลที่ผูกรหัสไว้ใน `SalesmanEmailAssignment` · อีเมลที่ไม่มีสิทธิ์ = 403 พร้อมข้อความ |
| ไม่ครอบคลุม | **ร้านค้า** — route นี้ออกเฉพาะ sales session |

ทางเข้าฝั่งร้านค้า:

| วิธี | ขั้นตอน |
|---|---|
| เร็วที่สุด | เข้าเป็น Creator แล้วเปิด `/vmi/admin/preview/vda` เลือกรหัส VDA (ต้องมี `stock_cover_day` ใน cache ไม่งั้น 503) |
| ขั้นตอนจริง | สร้าง/อนุมัติบัญชีที่ `/vmi/admin/stores/accounts` → ได้ **รหัสตั้งค่า** (ใช้ครั้งเดียว 72 ชม.) → ตั้งรหัสผ่านที่ `/vmi/login?mode=customer` (≥ 8 ตัว) |

> เดิมผู้ใช้เข้าเป็นร้านค้าได้โดยเลือกรหัส VDA อย่างเดียว ตั้งแต่ 28 ส.ค. 2569 ช่องทางนี้
> (`/api/auth/customer/login`) สงวนไว้สำหรับผู้ดูแลระบบเท่านั้น เอกสารที่บอกว่าเลือก VDA แล้วเข้าได้ทันทีคือของเก่า

### 6.2 การเพิ่ม API route

1. สร้างไฟล์ `app/api/<ชื่อ>/route.ts`
2. **ตรวจสอบสิทธิ์เป็นลำดับแรกเสมอ** — `getAuthorizedStore()` ฝั่งร้านค้า, `getSalesSession()` /
   `getRawSalesSession()` ฝั่งเซลล์/แอดมิน แล้ว `can(session, …)` สำหรับสิทธิ์หน้าตั้งค่า
3. route ที่เขียนข้อมูลฝั่งเซลล์ต้องเรียก `salesPreviewReadOnly(session)` · route ที่แตะออเดอร์ต้อง `assertOrderAccess()`
4. ใช้ zod ตรวจสอบข้อมูลที่รับจากผู้ใช้ ตอบ error เป็นภาษาไทย
5. ถ้าเป็นการกระทำของผู้ดูแล → `recordAudit()` หลังสำเร็จ (เพิ่ม action ใน `AUDIT_ACTION_LABELS` — มีเทสต์ `audit-log-labels.test.ts`)
6. เพิ่มรายการใน [05 — API Reference](./05-api-reference.md) และ [12](./12-project-structure.md) §4
7. เรียกจาก client ด้วย `apiFetch(appPath("/api/…"))`

### 6.3 การเพิ่มสถานะ PO

แก้ไขที่ `lib/po/po-status.ts` เพียงไฟล์เดียว เนื่องจากคอลัมน์ในฐานข้อมูลเป็นชนิด `String`
ไม่ใช่ enum จึง**ไม่ต้อง migrate** ค่าเดิมที่ไม่ตรงกับรายการใหม่จะแสดงเป็น "ไม่ทราบสถานะ"
หากเพิ่ม tone ใหม่ต้องเพิ่มคลาสใน `PO_STATUS_CLASS` ด้วย · สถานะที่ระบบตั้งเองต้องอยู่ใน
`SYSTEM_ONLY_PO_STATUSES` (คนเลือกจาก dropdown ไม่ได้) และดู `checkManualPoStatusChange` / `poMayBeInErp`

หากสถานะใหม่ควรแจ้งให้ร้านค้าทราบ ต้องเพิ่มการแจ้งเตือนที่ `app/api/sales/purchase-orders/[poNumber]/route.ts`

### 6.4 การเพิ่มชนิดการแจ้งเตือนร้านค้า

1. `lib/orders/store-notify.ts` — เพิ่มค่าใน `StoreNotificationKind`
2. `lib/orders/store-notify-display.ts` — เพิ่มใน `NOTIF_META` **และ** `notifTone`
3. ปรับคำอธิบายใน `prisma/schema.prisma` (เป็นความคิดเห็นเท่านั้น ไม่ต้อง migrate)
4. ส่ง `orderId` มาด้วยเสมอเมื่อผูกกับออเดอร์ — กระดิ่งใช้พาไปเปิดออเดอร์นั้น

ฝั่งเซลล์ทำแบบเดียวกันที่ `lib/orders/sales-notify.ts` (`SalesNotificationKind`) และ `ORDER_KIND_META`
ใน `lib/orders/sales-notify-display.ts` (ใช้ทั้งกระดิ่งและหน้า `/sales/notifications`)

### 6.5 การเพิ่มตารางข้อมูลจาก Fabric

แก้ไขที่ `lib/fabric/datasets.ts` (+ spec ใน `onelake-refresh.ts`, path ใน `paths.ts`, loader/registry ใน `lib/fabric/`)
ชุดทดสอบ `dataset-specs.test.ts` กำหนดว่าทุก dataset ต้องระบุชื่อไฟล์ต้นทางได้โดยไม่ต้องอาศัย env ·
ไฟล์ที่ไม่มีใครใช้ต้องไม่เป็น `required` (ไม่งั้นดึงไม่สำเร็จแล้วทั้งรอบนับว่าล้ม) · ก่อนเขียน loader ให้ probe
ชื่อคอลัมน์จริงก่อน (ดูสคริปต์ `probe-*`) — `requiredColumns` ไม่ตรงจะตีตกทั้งไฟล์

### 6.6 การเพิ่มตัวแปรสภาพแวดล้อม

พิจารณาก่อนว่า **ใส่เป็นค่าคงที่ในโค้ดได้ไหม** (นโยบาย §1.3) ถ้าต้องเป็น env จริง ต้องมีค่าเริ่มต้นที่ปลอดภัยในโค้ด
แล้วอธิบายใน `.env.example` · **ระบบต้องไม่ทำงานผิดพลาดเงียบ ๆ เมื่อไม่ได้ตั้งค่า** หากขาดไม่ได้
ให้ตรวจและหยุดตั้งแต่ boot ใน `instrumentation.ts` ตามตัวอย่าง `lib/auth/session-secret.ts` ·
ตัวแปร `NEXT_PUBLIC_*` ถูกฝังตอน `next build` เท่านั้น (และ `.dockerignore` กัน `.env` ออกจาก build context)

---

## 7. กติกาความปลอดภัยของ ERP

การส่ง PO เข้า ERP (`insertOCROrderToBill`) ย้อนไม่ได้: คู่ `orderNo` + `customerCode` ที่ยิงไปแล้ว
ถูกปลายทางล็อก **6 เดือน** ไม่มี resend/override ⇒ เลข PO ใบนั้นเสียทิ้ง

| กติกา | รายละเอียด |
|---|---|
| route เดียวที่ยิงออกนอกเครื่อง | `POST /api/sales/purchase-orders/[poNumber]/send-erp` → `deliverPoToErp()` ใน `lib/po/erp-delivery.ts` · โค้ดอื่นห้าม `fetch` ปลายทาง ERP |
| **ห้ามยิง send-erp เอง** ระหว่างพัฒนา/ทดสอบ | จนกว่าจะได้รับคำสั่งชัดเจน — เคยเผลอส่งจริงไปแล้ว 1 ใบ · ทดสอบด้วย `npm run erp:preview`, `GET …?format=erp` หรือ unit test ที่ส่ง `fetch` ปลอม |
| ปลายทาง | มีแค่ `ERP_UAT_URL` ใน `lib/po/erp-endpoint.ts` · โฮสต์ production **ไม่ถูกเขียนไว้ในโค้ด** — สลับไป prod ต้องแก้โค้ดแล้ว deploy โดยตั้งใจ |
| สวิตช์ | `SEND_ENABLED` ในโค้ด (เปิดอยู่ตั้งแต่ 14 ก.ย. 69) · `ERP_SEND_DISABLED=1` ใน env = เบรกฉุกเฉิน **ปิดได้อย่างเดียว เปิดไม่ได้** → `erpEndpoint()` คืน `null` → route ตอบ 503 |
| **ไม่มี auto-retry และจะไม่มี** | timeout = "อาจเข้าไปแล้ว" การยิงซ้ำคือสิ่งที่ทำให้เลขถูกล็อก · อย่าเพิ่ม retry ใน `postErpPayload` หรือฝั่ง client |
| ด่านก่อนยิง | session เซลล์ · ไม่ใช่มุมมองทดสอบ · `assertOrderAccess` · `erpSentAt` ว่าง · ไม่ถูกแทนที่ (`replacedByPoNumber`) · ไม่มี `erpError` ค้าง · `checkErpReadiness` ผ่าน |
| ประทับผล | compare-and-set (`erpSentAt: null`) ⇒ กดพร้อมกันยิงจริงได้ครั้งเดียว · สำเร็จต่อเมื่อ HTTP 200 **และ** `success === true` |
| ถูกปฏิเสธ (`rejected`) | ทางออกเดียว = `clone-for-erp` ออกเลขใหม่เนื้อหาเดิม (`lib/po/clone-for-erp.ts`) |
| ไม่รู้ผล (`erp_unknown`: timeout/เน็ต/HTTP error) | ล็อกทุกทาง (ส่งซ้ำ ขอเลขใหม่ ลบ ยกเลิก ไม่ได้) จนคนตรวจกับทีม ERP แล้วกด "บันทึกผล" → `POST …/erp-resolve` → `resolveAmbiguousErpResult()` ใน `lib/po/erp-resolve.ts`: `in_erp` = ปักว่าส่งสำเร็จ · `not_in_erp` = ล้างผล ส่งได้อีกครั้ง **ด้วยเลขเดิม** (ปลอดภัยกว่าเลขใหม่) · บันทึก audit พร้อม error เดิม |
| แจ้งผล | `notifyErpSendResult` / `notifyPoReplaced` (`lib/po/erp-notify.ts`) ให้เซลล์คนอื่นของคลังเห็นด้วย |

สเปก payload และการตัดสินใจทั้งหมดอยู่ใน [`docs/ERP-PO-PLAN.md`](../ERP-PO-PLAN.md)

---

## 8. รายการตรวจสอบก่อนส่งมอบงาน

```bash
npm test                 # 1. ชุดทดสอบต้องผ่านทั้งก่อนและหลังการแก้ไข
npx tsc --noEmit         # 2. ต้องไม่มีข้อผิดพลาดด้านชนิดข้อมูล
npm run lint             # 3. ต้องไม่มี warning เพิ่มขึ้นจากเดิม
npm run dev:stop         # 4. หยุด dev ก่อน build เสมอ (ใช้ .next ร่วมกัน)
npm run build            # 5. build ต้องสำเร็จ
```

6. **เปิดหน้าจอจริงเพื่อตรวจสอบผลลัพธ์ — สำคัญที่สุด** การ build สำเร็จไม่ได้หมายความว่าระบบทำงานถูกต้อง
   ทดสอบทั้งจอ desktop, **จอกว้างต่ำกว่า 1280px** (iPad / หน้าต่างครึ่งจอ) และมือถือ 390px
7. แก้ `schema.prisma` → มีโฟลเดอร์ migration ใหม่ใน commit (§3.2)
8. เพิ่ม/ย้ายหน้าแอดมิน → อัปเดต `ADMIN_GROUPS` / `ADMIN_LEGACY_REDIRECTS` · เพิ่ม route/ไฟล์ระดับโฟลเดอร์ → อัปเดต [05](./05-api-reference.md) และ [12](./12-project-structure.md)
9. ไม่มีการเรียก send-erp ในระหว่างทดสอบ และ `.env` ของเครื่องมี `ERP_SEND_DISABLED=1`

---

## 9. ข้อควรทราบก่อนนำขึ้นใช้งานจริง

รายละเอียดทั้งหมดอยู่ใน [09 — Production Deploy](./09-deployment.md) สรุปจุดที่พบปัญหาบ่อย

| หัวข้อ | ข้อควรระวัง |
|---|---|
| `NEXTAUTH_SECRET` | production จะ **ไม่เริ่มทำงาน** หากไม่ได้กำหนด สั้นกว่า 32 ตัวอักษร หรือยังเป็นค่าตัวอย่าง |
| การเปลี่ยน secret | ผู้ใช้ทุกคนจะออกจากระบบพร้อมกัน ควรเปลี่ยนเมื่อมีเหตุจำเป็นเท่านั้น |
| migration | `docker/entrypoint.sh` = backup → `npx prisma migrate deploy` → `next start` ทุกครั้งที่ container start |
| nginx | path `/vmi/` ต้องมี `/` ปิดท้าย เนื่องจาก `trailingSlash: true` ทำให้ path ที่ไม่มี `/` ตอบ 308 |
| healthcheck | ต้องใช้ `curl -fsSL` พร้อม `/` ปิดท้าย มิฉะนั้น curl ผ่านบน 308 โดยไม่ได้เรียก handler จริง |
| volume | `vmi_data` (DB + cache), `vmi_backups`, `vmi_logs` (เอกสาร PO) — อย่าลบตอน redeploy |
| อีเมลแจ้งเตือน | ต้องกำหนด **ทั้ง** `ALERT_EMAIL` และ `SENDER_EMAIL` มิฉะนั้นระบบข้ามการส่งเงียบ ๆ |
| `DEV_LOGIN` | ห้ามตั้งบน server (route ปิดเองใน production อยู่แล้ว) |

---

## 10. เอกสารที่เกี่ยวข้อง

| หัวข้อ | เอกสาร |
|---|---|
| แผนที่ไฟล์ทั้ง repo + request flow | [12 — แผนที่โครงสร้างโปรเจกต์](./12-project-structure.md) |
| สถาปัตยกรรมและการไหลของข้อมูล | [02 — สถาปัตยกรรม](./02-architecture.md) |
| การยืนยันตัวตนแต่ละบทบาท | [03 — การยืนยันตัวตน](./03-authentication.md) |
| รายการ API ทั้งหมด | [05 — API Reference](./05-api-reference.md) |
| การ sync ข้อมูลจาก Fabric | [06 — Fabric / OneLake](./06-fabric-integration.md) |
| โครงสร้างตารางข้อมูล | [07 — Data Model](./07-data-model.md) |
| กฎทางธุรกิจ (CVD, โปรโมชัน, PO) | [08 — กฎทางธุรกิจ](./08-business-rules.md) |
| การแก้ปัญหาหน้างาน | [10 — ปฏิบัติการ & แก้ปัญหา](./10-operations-troubleshooting.md) |
| งานที่ยังค้างและเหตุผลประกอบ | [`docs/IMPROVEMENT-PLAN.md`](../IMPROVEMENT-PLAN.md) |
| แผนและสเปกการส่ง PO เข้า ERP | [`docs/ERP-PO-PLAN.md`](../ERP-PO-PLAN.md) |
