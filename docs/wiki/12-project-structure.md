[← กลับหน้าแรก](./00-home.md)

# 12 — แผนที่โครงสร้างโปรเจกต์ (สำหรับส่งต่องานพัฒนา)

แผนที่ไฟล์ทั้ง repo ว่าอะไรอยู่ที่ไหน ทำหน้าที่อะไร และ "แหล่งความจริง" ของแต่ละเรื่องอยู่ไฟล์ไหน
อ่านคู่กับ [11 — คู่มือนักพัฒนา](./11-developer-guide.md) (วิธีทำงาน/กติกา) · รายละเอียด API แต่ละเส้นอยู่ที่
[05 — API Reference](./05-api-reference.md)

> ตรวจกับโค้ดจริงล่าสุด 29 ก.ย. 2569 (commit `1877286`) — ถ้าเพิ่ม/ย้าย/ลบไฟล์ระดับโฟลเดอร์ ให้แก้หน้านี้ด้วย

---

## 1. ภาพรวมระดับบนสุด

```
VMI/
├─ app/                 Next.js App Router — หน้าเว็บ + API route (app/api/**)
├─ components/          React component ทั้งหมด (UI) — ตรรกะธุรกิจอยู่ใน lib/
├─ lib/                 ตรรกะหลักทั้งหมด (auth, fabric, po, promo, orders, stock …)
├─ hooks/               React hooks ฝั่ง client
├─ types/               ว่าง (ไม่มีไฟล์ใน git) — type จริงอยู่ข้างโมดูลใน lib/
├─ prisma/              schema.prisma · migrations/ · seed.ts · dev.db (ไม่อยู่ใน git)
├─ scripts/             sync / backup / probe / verify / ตัวช่วย dev
├─ tests/               Vitest (*.test.ts = logic ล้วน, *.db.test.ts = SQLite ชั่วคราว)
├─ notebooks/           Fabric notebook (PySpark) ที่สร้าง factsales_odoo.csv — รันบน Fabric ไม่ใช่ที่นี่
├─ docker/              Dockerfile + entrypoint.sh (backup → migrate deploy → next start)
├─ docs/                wiki/ (เอกสารชุดนี้) · IMPROVEMENT-PLAN.md · ERP-PO-PLAN.md
├─ public/              ว่าง (มีแค่ .gitkeep)
├─ data/                ← runtime ไม่อยู่ใน git: cache/ (CSV จาก OneLake) · logs/ (สถานะ sync)
├─ logs/                ← runtime ไม่อยู่ใน git: po-export/ (JSON เอกสาร PO) · erp-preview/
├─ backups/             ← runtime ไม่อยู่ใน git: สำเนา SQLite จาก scripts/backup-db.mjs
├─ .tmp-qa/             ← ไม่อยู่ใน git: บัญชี/สคริปต์ QA ชั่วคราวบนเครื่อง dev
├─ middleware.ts        ด่านแรก (Edge) — เช็คแค่ "มี cookie ไหม" แล้ว redirect ไป /login
├─ instrumentation.ts   boot hook — ตรวจ secret, bootstrap admin, ทะเบียน VDA, scheduler, preload master
├─ next.config.ts       basePath "/vmi" · trailingSlash: true · compress · ไม่มี source map
├─ vitest.config.ts     environment node · include tests/**/*.test.ts · alias ผ่าน vite-tsconfig-paths
├─ eslint.config.mjs    next/core-web-vitals + next/typescript + กฎห้าม fetch("/api/…") ตรง ๆ
├─ docker-compose.yml   service vmi · 127.0.0.1:3002→3000 · volume data/backups/logs · healthcheck
├─ .env.example         ตัวอย่าง env + คำอธิบาย (ตั้งจริงราว 21 บรรทัด)
├─ .dockerignore        กัน data/ logs/ backups/ prisma/dev.db .env docs tests ออกจาก build context
├─ postcss.config.mjs   Tailwind v4 (@tailwindcss/postcss)
├─ tsconfig.json        alias "@/*" → ราก repo
└─ package.json         scripts ทั้งหมด (ดู 11 §1.2) · ไม่มีฟิลด์ engines — ใช้ Node 20 ตาม Dockerfile
```

> `shadow-check.db` ที่รากถูก commit ติดมาใน `90e982a` — เป็นไฟล์ SQLite ชั่วคราว ไม่มีโค้ดไหนอ้างถึง

---

## 2. แหล่งความจริง (source of truth) ของเรื่องสำคัญ

แก้เรื่องไหน ให้แก้ที่ไฟล์นี้ก่อน — ที่อื่นอ่านต่อจากตรงนี้ทั้งหมด

| เรื่อง | ไฟล์ | หมายเหตุ |
|---|---|---|
| สิทธิ์ Creator / Admin / เซลล์ | `lib/auth/permissions.ts` | `can()`, `isCreator()`, `hasSalesView()`, `homePathFor()` · ไม่ import Prisma ใช้ได้ทั้ง client/server |
| บทบาท + ชื่อ cookie | `lib/auth/roles.ts` | `middleware.ts` ประกาศชื่อ cookie ซ้ำเอง (Edge import Prisma ไม่ได้) |
| session เซลล์/แอดมิน | `lib/auth/sales-session.ts` | `buildSalesSessionWithAccess`, `getSalesSession`, `salesPreviewReadOnly` |
| ตัวตนร้านค้า | `lib/auth/store-context.ts` | `getAuthorizedStore()` — ทางเดียวที่อนุญาต |
| secret เซ็น cookie | `lib/auth/session-secret.ts` | production ไม่ boot ถ้าไม่ปลอดภัย |
| Azure App (client/tenant id) | `lib/auth/azure-app.ts` | อยู่ในโค้ด ไม่ใช่ env |
| basePath `/vmi` + normalize path | `lib/paths.ts` | `BASE_PATH` ต้องตรงกับ `next.config.ts` |
| fetch ฝั่ง client | `lib/api-fetch.ts` | `apiFetch` โยน `UnauthorizedError` เมื่อ 401 |
| สถานะ PO | `lib/po/po-status.ts` | `PO_STATUSES`, สถานะที่ระบบตั้งเอง (`sending_erp`/`sent_erp`/`erp_unknown`), `checkManualPoStatusChange` |
| ปลายทาง ERP + สวิตช์ | `lib/po/erp-endpoint.ts` | มีแค่ URL UAT · `SEND_ENABLED` · `ERP_SEND_DISABLED=1` |
| สเปก payload ERP | `lib/po/erp-payload.ts` | pure ทั้งไฟล์ · `checkErpReadiness` |
| กฎแบ่ง PO | `lib/po/split-plan.ts` | `proposePoSplit`, `validatePoSplit` |
| รูปแบบเลข PO | `lib/po/po-number.ts` + `lib/po/po-sequence.ts` | ≤12 ตัว A-Z0-9 · ลำดับ atomic ต่อ (คลัง, วัน) |
| เมนู/เส้นทางหน้าแอดมิน + redirect เก่า | `lib/admin/admin-nav.ts` | `ADMIN_GROUPS`, `ADMIN_LEGACY_REDIRECTS` |
| ป้าย audit log | `lib/admin/audit-log-labels.ts` | `AUDIT_ACTION_LABELS`, `AUDIT_DETAIL_LABELS` (client ใช้ได้) · ตัวเขียนอยู่ `lib/admin/audit-log.ts` |
| ทะเบียนรหัสเซลล์ ↔ อีเมล ↔ VDA | `lib/admin/vda-sales-directory.ts` + ตาราง `SalesmanEmailAssignment` | ไม่ใช้ cross_salesman master แล้ว |
| ทะเบียนคลัง VDA → รหัสลูกค้า | `lib/fabric/vda-warehouse-registry.ts` + ตาราง `VdaWarehouse` | ชนะ `VDA_CUSTOMER_MAP` เสมอ |
| ชุดข้อมูลที่ sync จาก OneLake | `lib/fabric/datasets.ts` | ชื่อไฟล์/ขั้นต่ำแถว/required · มีเทสต์ `dataset-specs.test.ts` |
| ที่อยู่ไฟล์ cache ในเครื่อง | `lib/fabric/paths.ts` | `FABRIC_CACHE_DIR` หรือ `data/cache` |
| สูตร CVD / แนะนำสั่ง | `lib/calculations/index.ts` | `getCvdFlag`, `calcSuggestOrder` (ปัดขึ้นโดยตั้งใจ) |
| ลำดับความสำคัญของราคา | `lib/calculations/price-override.ts` | `resolveOrderLinePrice` |
| กติกา MIN/MAX | `lib/stock/threshold-rules.ts` · ค่าเริ่มต้น `lib/stock/threshold-defaults.ts` | |
| ชนิดแจ้งเตือนร้าน / เซลล์ | `lib/orders/store-notify.ts` / `lib/orders/sales-notify.ts` | ป้ายแสดงผลอยู่ไฟล์ `*-display.ts` คู่กัน |
| สิทธิ์เห็นออเดอร์ของเซลล์ | `lib/orders/access.ts` | `assertOrderAccess`, `resolveOrderStoreScope` |
| schema ฐานข้อมูล | `prisma/schema.prisma` | เปลี่ยนแล้วต้องมี migration จริง |

---

## 3. `app/` — หน้าเว็บ

ทุก URL ขึ้นต้นด้วย `/vmi` (basePath) และลงท้ายด้วย `/` (trailingSlash)

### 3.1 หน้าระดับบนและฝั่งร้านค้า

| path | หน้าที่ |
|---|---|
| `app/layout.tsx` · `loading.tsx` · `globals.css` | layout ราก, Providers, สไตล์รวม (รวมบล็อก "หน้าตรวจออเดอร์บนจอกว้าง") |
| `app/error.tsx` · `global-error.tsx` · `not-found.tsx` | หน้ารองรับข้อผิดพลาด |
| `app/page.tsx` | หน้าแรก — มี session แล้วพาไปหน้าแรกตามตำแหน่ง (`homePathFor`) ไม่มีก็แสดงหน้าเลือกทางเข้า |
| `app/login/page.tsx` | `?mode=customer` (ร้าน) / `?mode=sales` (Microsoft) |
| `app/auth/callback/page.tsx` | redirect URI ของ MSAL (SPA) → `components/auth/microsoft-callback-client.tsx` |
| `app/auth/microsoft/callback/page.tsx` | callback ของ flow ฝั่ง server เดิม (ไม่มีใครเรียกแล้ว) |
| `app/stock/` | หน้าสต็อก + ตะกร้าสั่ง (`components/stock/stock-page-client.tsx`) |
| `app/order/` | หน้าสั่งของ (`components/order/order-page-client.tsx`) |
| `app/history/` | ประวัติออเดอร์ + ยืนยัน/ปฏิเสธรายการที่พนักงานแก้ (`?order=`) |
| `app/manage/` | ตั้งค่าร้าน (MIN/MAX, หยุดสั่ง, เปลี่ยนรหัสผ่าน) |

### 3.2 ฝั่งเซลล์ `app/sales/`

| path | หน้าที่ |
|---|---|
| `layout.tsx` | กรอบ + `SalesNav` |
| `page.tsx` | ภาพรวม (dashboard) |
| `orders/` | ตรวจ/อนุมัติออเดอร์ (`sales-orders-client.tsx`) · `?order=&status=` |
| `po/` | รายการ PO, รายละเอียด, ส่ง ERP (`sales-po-client.tsx`, `po-detail-panel.tsx`) |
| `promotions/` | ดูโปร C4 |
| `notifications/` | รายการแจ้งเตือนเซลล์ |

### 3.3 ฝั่งผู้ดูแล `app/admin/`

โครงเมนูกำหนดใน `lib/admin/admin-nav.ts` — หน้าเก่าเป็นแค่ stub `redirect()` ตาม `ADMIN_LEGACY_REDIRECTS`

| path | หน้าที่ | ใครเข้าได้ |
|---|---|---|
| `layout.tsx` | `AdminShell` + แท็บ | Creator/Admin |
| `data/sync` | Sync & สถานะ OneLake | Creator |
| `data/raw` | ดูข้อมูลดิบ (CSV + ตาราง DB) | Creator |
| `data/warehouses` | ทะเบียนคลัง VDA | Creator |
| `stores/accounts` | บัญชีร้านค้า (อนุมัติ/สร้าง/รีเซ็ต) | Creator + Admin (`stores.view`) |
| `stores/thresholds` | MIN/MAX & หยุดสั่งแทนร้าน | Creator |
| `promotions/c4` | โปร C4 เดือนนี้ | Creator + Admin (`promotions.view`) |
| `preview/vda` · `preview/sales` | มุมมองทดสอบ (สวมสิทธิ์ร้าน/เซลล์) | Creator |
| `system/admins` | จัดการ Admin (`layout.tsx` = `CreatorOnlyLayout`) | Creator |
| `system/vda-sales` | สิทธิ์เซลล์-VDA (ผูกอีเมล ↔ รหัส) | Creator + Admin (`salesCodes.view`) |
| `system/audit` | บันทึกการทำงาน (`layout.tsx` = creator เท่านั้น) | Creator |
| `page.tsx`, `dev/`, `sync/`, `stores/page.tsx`, `thresholds/`, `promo/`, `vda/`, `sales/`, `settings/`, `data/page.tsx`, `preview/page.tsx`, `promotions/page.tsx`, `system/page.tsx` | redirect stub (URL เก่า / หมวดเปล่า → แท็บแรก) | — |

`layout.tsx` ของหมวด `data/`, `preview/`, `stores/thresholds/` กันเป็น creator เท่านั้นเช่นกัน (ใช้
`components/admin/creator-only-layout.tsx`)

---

## 4. `app/api/` — API route ทุกโฟลเดอร์

รายละเอียดพารามิเตอร์ดู [05](./05-api-reference.md) · ทุก route ตรวจสิทธิ์ก่อนเสมอ

| โฟลเดอร์ | method | หน้าที่ |
|---|---|---|
| `health/` | GET | DB ping + สถานะ fabric/scheduler (Docker healthcheck) |
| `vda/` | GET | รายชื่อ VDA (ไม่ต้อง auth — หน้า login ใช้) |
| `data-version/` | GET | เวอร์ชันข้อมูลต่อร้าน ใช้ล้าง cache ฝั่ง client |
| `dev/login/` | GET | **dev เท่านั้น** — สร้าง sales session ตามอีเมล (ดู 11 §6.1) |
| `stock/` | GET·PATCH | แถวสต็อกของร้าน · แก้ MIN/MAX ราย SKU |
| `stock/refresh/` | POST | ร้านกด "ตรวจข้อมูลใหม่" (ผ่าน `runMasterRefresh`) |
| `stock/export/` | GET·POST | Excel ตามตัวกรองบนจอ / ฟอร์มสั่ง |
| `orders/` | GET·POST·PATCH·DELETE | ลิสต์ตามสิทธิ์ · ร้านส่งออเดอร์ · action ของเซลล์ (approve, reject, updateQty, updatePrice, rejectItem, addItem, assignPoGroup …) · ลบ |
| `orders/clear-sku/` | DELETE | เคลียร์สิ้นเดือนราย SKU |
| `store/orders/` | PATCH·DELETE | ร้านตอบรายการที่รอยืนยัน · ร้านยกเลิก (= ลบระเบียน) |
| `store/order-history/` | GET | ประวัติ + สรุปราย SKU |
| `store/notifications/` | GET·PATCH | แจ้งเตือนร้าน (`?count=1` สำหรับ badge) |
| `store/thresholds/` | GET·PATCH | MIN/MAX ระดับกลุ่ม |
| `store/blocklist/` | GET·POST·DELETE | หยุดสั่ง |
| `sales/dashboard/` · `sales/pending-count/` | GET | หน้าภาพรวม / badge (คิวรีเดียวกันใน `lib/sales/dashboard-queries.ts`) |
| `sales/daily/` | GET | ยอดขายรายวันของ SKU (ใช้ session **ร้าน**) |
| `sales/notifications/` | GET·POST | แจ้งเตือนเซลล์ + mark read (อ่านรายคน) |
| `sales/order-promo/` | POST | คำนวณโปรสดในหน้าตรวจ |
| `sales/sku-search/` | GET | ค้นทั้งแคตตาล็อก (เพิ่มสินค้าเข้าออเดอร์) |
| `sales/vda-access/` | GET | VDA ที่ผู้ใช้ดูแล |
| `sales/active-code/` | POST | สลับรหัสเซลล์ที่ใช้งาน |
| `sales/purchase-orders/` | GET·DELETE | ลิสต์ PO · ลบหลายใบ |
| `sales/purchase-orders/export/` | POST | Excel หลายใบ (≤ 50) |
| `sales/purchase-orders/[poNumber]/` | GET·PATCH | ดาวน์โหลด/ดู/`?format=erp` พรีวิว payload · เปลี่ยนสถานะด้วยมือ |
| `sales/purchase-orders/[poNumber]/send-erp/` | POST | ⚠️ **route เดียวที่ยิงออกนอกเครื่อง** — ส่ง PO เข้า ERP |
| `sales/purchase-orders/[poNumber]/clone-for-erp/` | POST | ใบที่ ERP ปฏิเสธ → ออกเลขใหม่เนื้อหาเดิม |
| `sales/purchase-orders/[poNumber]/erp-resolve/` | POST | ปิดเรื่อง `erp_unknown` หลังตรวจกับทีม ERP (`in_erp` / `not_in_erp`) + audit |
| `promo/month/` · `promo/month/export/` | GET | โปร C4 ทั้งเดือน + Excel |
| `promo/lookup/` | POST | ขั้นโปรของ SKU ตามจำนวน |
| `promo/inspector/` | GET | debug ว่าทำไม SKU ได้/ไม่ได้โปร |
| `promo/assorted-names/` | GET | ชื่อกลุ่มโปร (ASSORTEDPRODUCTGROUP → ชื่อ) |
| `auth/store/login` · `request` · `request-reset` · `set-password` · `change-password` | POST | บัญชีร้าน (มี rate limit) |
| `auth/customer/login` · `logout` | POST | เข้าเป็นร้านแบบเลือก VDA — **admin เท่านั้น** / ออก |
| `auth/msal/me` · `auth/msal/session` | GET / POST·DELETE | **login จริงของเซลล์/แอดมิน** (ตรวจ id_token ฝั่ง server) |
| `auth/microsoft/login` · `callback` | GET | flow ฝั่ง server เดิม — ไม่มีใครเรียกแล้ว |
| `auth/admin/preview-sales` · `exit-sales-preview` · `exit-preview` | POST | เข้า/ออกมุมมองทดสอบ |
| `admin/admins/` | GET·POST·DELETE | จัดการ Admin (creator) |
| `admin/audit-log/` | GET | บันทึกการทำงาน (creator) |
| `admin/badges/` | GET | ตัวเลขบนเมนูแอดมิน |
| `admin/store-accounts/` | GET·POST·PATCH·DELETE | บัญชีร้านค้า |
| `admin/store-thresholds/` · `admin/store-blocklist/` | GET·PATCH / GET·POST·DELETE | MIN/MAX และหยุดสั่งแทนร้าน |
| `admin/refresh-masters/` · `admin/refresh-status/` | POST / GET | สั่ง sync / สถานะรอบล่าสุด |
| `admin/vda-warehouses/` | GET·PUT | ทะเบียนคลัง VDA |
| `admin/vda-sales/` | GET | ทะเบียนเซลล์ ↔ VDA |
| `admin/salesman-assignments/` | GET·POST·DELETE | ผูกอีเมล ↔ รหัสเซลล์ |
| `admin/sales-codes/` | GET | ตัวเลือก "กรองตามรหัสเซลล์" (แทน `/api/admin/salesmen` เดิมที่ลบไปแล้ว) |
| `admin/customers/search` · `resolve` | GET | ค้น/แปลงรหัสลูกค้า |
| `admin/data-explorer/sources` · `csv` · `db` | GET | หน้า "ดูข้อมูลดิบ" |
| `admin/promo/explain/` | GET | เหตุผลที่ SKU ได้/ไม่ได้โปร |

---

## 5. `components/`

| โฟลเดอร์/ไฟล์ | สิ่งที่อยู่ข้างใน |
|---|---|
| `providers.tsx` | React Query + ตัวจับ `UnauthorizedError` ส่วนกลาง (พาไปหน้า login) |
| `theme-provider.tsx` · `theme-toggle.tsx` | โหมดสว่าง/มืด |
| `ui/` | ชิ้นส่วนพื้นฐาน: `button` `badge` `card` `checkbox` `input` `modal` `confirm-dialog` `toast` `notice-banner` `anchored-panel` `sortable-th` `stat-card` `mobile-row` `cvd-flag-cell` `thai-date-echo` — **ใช้ `Modal`/`ConfirmDialog` แทน `window.confirm`** |
| `layout/` | `app-header` `page-shell` `public-topbar` · กระดิ่ง `store-notification-bell` / `sales-notification-bell` |
| `auth/` | ฟอร์ม login ร้าน (`store-login-form`, `customer-login-form`), ปุ่ม Microsoft, `microsoft-callback-client` |
| `stock/` | หน้าสต็อก: `stock-page-client` (ไฟล์ใหญ่สุด), toolbar, ตัวปรับจำนวน, ราคา, สรุป, มุมมองโปร, dialog ตรวจก่อนส่ง/ขั้นโปร, `stop-order-modal`, `product-sales-panel` |
| `order/` | `order-page-client`, `order-notice-bar`, `store-price-input` (ร้านแก้ราคา) |
| `history/` | `order-history-client` (ประวัติ + ยืนยันรายการ) |
| `manage/` | `manage-client` (ตั้งค่าร้าน) |
| `promo/` | `c4-promo-modal` (portal เอง — เรียก `useFocusTrap` เอง), แถวของแถม, หัวกลุ่มโปร, แถบขั้นบันได |
| `sales/` | หน้าตรวจออเดอร์ (`sales-orders-client`, `order-review-table`, `po-split-panel`), PO (`sales-po-client`, `po-detail-panel`, `po-erp-payload-section`), modal ต่าง ๆ (ปฏิเสธ, เพิ่มสินค้า `add-order-item-modal` + `sku-picker`, เคลียร์สิ้นเดือน), `sales-code-filter`, `sales-nav`, dashboard, โปร, แจ้งเตือน |
| `admin/` | `admin-shell` `admin-tabs-nav` `admin-sub-tabs` `creator-only-layout` · แผงของแต่ละแท็บ: sync (`fabric-sync-panel`), บัญชีร้าน, thresholds, โปร, คลัง VDA, preview, รหัสเซลล์ (`sales-code-directory-panel`), ผู้ดูแล (`admin-emails-section`), `audit-log-section`, `customer-code-picker` |
| `admin/data-explorer/` | หน้า "ดูข้อมูลดิบ": `data-explorer-panel`, `raw-table`, `raw-row-modal` |

---

## 6. `lib/` — ตรรกะหลัก

ไฟล์เดี่ยวที่ราก `lib/`:

| ไฟล์ | หน้าที่ |
|---|---|
| `prisma.ts` | Prisma client ตัวเดียว (อ่าน `DATABASE_URL` ตอนสร้างครั้งเดียว — สำคัญกับเทสต์) |
| `paths.ts` | `appPath`, `normalizePathname`, `isPathUnder` |
| `api-fetch.ts` | `apiFetch` + `UnauthorizedError` |
| `error-message.ts` | `friendlyError` แปลง "Forbidden"/"Unauthorized" เป็นภาษาคน |
| `format-store-label.ts` | ชื่อร้าน/VDA, ตัวเลขบาทย่อ |
| `utils.ts` | `cn()` และตัวช่วยค้นหาสินค้า |

### 6.1 `lib/auth/` — ตัวตนและสิทธิ์

| ไฟล์ | หน้าที่ |
|---|---|
| `permissions.ts` | **สิทธิ์หน้าตั้งค่า** (Creator/Admin) — fail-closed |
| `roles.ts` | `UserRole`, ชื่อ cookie |
| `sales-session.ts` | เซ็น/ตรวจ session เซลล์, `buildSalesSessionWithAccess`, `salesPreviewReadOnly` (มุมมองทดสอบ = อ่านอย่างเดียว) |
| `session-secret.ts` | `NEXTAUTH_SECRET` + `assertSessionSecret()` ตอน boot |
| `admin-registry.ts` | Creator จาก `ADMIN_EMAILS`/`APP_ADMINS` + Admin จากตาราง `Admin` |
| `manual-salesman-assignments.ts` | อีเมล → รหัสเซลล์ (`SalesmanEmailAssignment`) |
| `azure-app.ts` · `microsoft-oauth*.ts` · `microsoft-id-token.ts` | ค่า Azure ในโค้ด, PKCE, ตรวจ id_token |
| `store-context.ts` | `getAuthorizedStore()` |
| `store-session.ts` | session ร้าน + ตรวจกับบัญชีปัจจุบันทุกครั้ง (`reconcileStoreSession`) |
| `store-account.ts` | บัญชีร้าน, รหัสตั้งค่า (setup code 72 ชม.) |
| `store-password.ts` · `password-rules.ts` | hash scrypt / เกณฑ์รหัส (ฝั่ง client ใช้ได้) |
| `store-login-helper.ts` | ตั้ง session หลัง login สำเร็จ |
| `customer-session.ts` | ร้านของ session ปัจจุบัน (ล้าง cookie ถ้า id ไม่ตรง DB) |
| `admin-preview*.ts` · `sales-preview.ts` | cookie มุมมองทดสอบ VDA / เซลล์ |
| `rate-limit.ts` | sliding window ในหน่วยความจำ (process เดียว) |

### 6.2 `lib/fabric/` — ข้อมูล master จาก OneLake (ไฟล์มากที่สุด)

| กลุ่ม | ไฟล์ | หน้าที่ |
|---|---|---|
| ทะเบียนชุดข้อมูล | `datasets.ts` | รายการ dataset (customer, salesman*, stock_cover_day, promotion_c4, assorted_mapping, sku_master, factsales_odoo, cross_target, vda*_product) |
| ดาวน์โหลด | `onelake-refresh.ts` · `onelake-credential.ts` · `env.ts` | ค้น/ดาวน์โหลดไฟล์จาก OneLake, credential chain, อ่าน env ของแต่ละ workspace |
| รอบ sync | `scheduler.ts` · `refresh-status.ts` · `data-age.ts` · `alert-email.ts` · `promo-month-watch.ts` | `runMasterRefresh()` ทางเข้าเดียว, รอบรายวัน (Asia/Bangkok), รอบรายชั่วโมงรอ C4 เดือนใหม่, `catchUpIfStale`, ไฟล์สถานะ, อีเมลเตือนผ่าน Graph |
| path | `paths.ts` | ที่อยู่ไฟล์ใน `data/cache` (override ได้ด้วย `*_CSV`) |
| อ่าน CSV | `csv.ts` · `csv-page-reader.ts` | ตัวอ่านของโปรเจกต์ (รับ `"` กลางค่า) / อ่านทีละหน้าสำหรับหน้าข้อมูลดิบ |
| registry ในหน่วยความจำ | `index.ts` | `warmFabricMasters`, `ensureFabricMastersFresh` (โหลดใหม่เมื่อ mtime เปลี่ยน), getter ของแต่ละ directory |
| สต็อก | `stock-cover.ts` · `stock-rows.ts` · `sync-stock-cover.ts` · `stock-filter-config.ts` · `store-key.ts` · `sku-created-at.ts` | stock_cover_day → แถวบนหน้าสต็อก, สร้าง `Sku` ใน DB, ป้ายสินค้าใหม่ |
| สินค้า/ยอดขาย | `sku-master.ts` · `sold-history.ts` · `vda-product-value.ts` · `sync-vda-product-values.ts` | ราคาเงินสด/แพ็ก/ค้นแคตตาล็อก, ยอดขายย้อนหลัง (มีจริง 30 วัน), มูลค่าสต็อกต่อ VDA |
| โปร C4 | `promotion-credit.ts` · `promotion-lookup.ts` · `promotion-context.ts` · `promo-context-check.ts` · `promo-coverage.ts` · `assorted-mapping.ts` | ตาราง C4, ค้นขั้นโปร, บริบท division/cusgroup, ตรวจตอน boot, วัดปริมาณโปรข้ามรอบ, ชื่อกลุ่ม |
| ลูกค้า/เซลล์/คลัง | `customer-directory.ts` · `cross-target.ts` · `vda-aos-bill.ts` · `vda-warehouse-registry.ts` · `vda-store-name.ts` | dim_customer, เป้าขายเดือนนี้ (ใช้หาเซลล์ของคลัง + แท็บ "ควรมีขาย"), ทะเบียน VDA → เซลล์/ลูกค้า |
| อื่น ๆ | `bkk-date.ts` · `data-version.ts` | วันที่โซนกรุงเทพ, เวอร์ชันข้อมูลต่อร้าน |

\* `salesman_registry` (cross_salesman_reference_email) ยังดึงมาเก็บแต่ **ไม่ใช้แล้ว** และไม่ required

### 6.3 `lib/po/` — PO และ ERP

| ไฟล์ | หน้าที่ |
|---|---|
| `approve-with-split.ts` | อนุมัติ + ออก PO ตามกลุ่ม: ตรวจ → จองสิทธิ์ (compare-and-set) → ออกเลข → เขียนไฟล์ → สร้างระเบียน |
| `approve-selected.ts` | อนุมัติบางรายการ — ที่ไม่เลือกย้ายเป็นออเดอร์ใหม่ แล้วเรียก `approveWithPoSplit` |
| `add-order-item.ts` | พนักงานเพิ่ม SKU ใหม่ / ร้านปฏิเสธแล้วลบแถว · `computePooledGroup` |
| `split-plan.ts` | กฎแบ่ง PO |
| `po-number.ts` · `po-sequence.ts` | เลข PO / ลำดับ atomic (`ON CONFLICT … RETURNING`) |
| `po-document.ts` | สร้างเอกสาร PO + `writePoDocument` → `<cwd>/logs/po-export/<PO>.json` |
| `po-from-db.ts` | ประกอบเอกสารใหม่จาก DB เมื่อไฟล์หาย |
| `order-item-doc-line.ts` | OrderItem → บรรทัดเอกสาร (จุดเดียว) |
| `sku-vat-status.ts` | VatStatus ต่อ SKU |
| `po-status.ts` | สถานะ PO (ดู §2) |
| `erp-payload.ts` | ประกอบ payload `insertOCROrderToBill` + `checkErpReadiness` (pure) |
| `erp-context.ts` | รหัสลูกค้า/เซลล์/วันที่สำหรับหัวใบ ERP |
| `erp-endpoint.ts` | ปลายทาง (UAT เท่านั้น) + สวิตช์ |
| `erp-delivery.ts` | `postErpPayload` (ยิงจริง) + `stampErpSuccess/Failure` (compare-and-set) + `deliverPoToErp` |
| `erp-resolve.ts` | `resolveAmbiguousErpResult` — ปิดเรื่อง `erp_unknown` |
| `clone-for-erp.ts` | ใบที่ถูกปฏิเสธ → ออกเลขใหม่ (`replacedByPoNumber`) |
| `erp-notify.ts` | แจ้งเตือนหลังรู้ผลส่ง/ขอเลขใหม่ |

### 6.4 `lib/orders/` · `lib/promo/` · `lib/calculations/` · `lib/stock/` · `lib/sales/` · `lib/admin/` · `lib/repositories/`

| โฟลเดอร์ | ไฟล์สำคัญ |
|---|---|
| `orders/` | `access.ts` (สิทธิ์เห็นออเดอร์) · `delete-orders.ts` (ลบทั้งใบ + PO + แจ้งร้าน + audit) · `delivery-date.ts` · `item-edit.ts` · `order-history-view.ts` · `store-notify(.ts/-display.ts)` · `sales-notify(.ts/-display.ts)` |
| `promo/` | `lookup-order-lines.ts` (โปรของบรรทัดออเดอร์ตอนส่ง) · `order-free-goods.ts` (`collectOwedFreeGoods`) · `promo-step.ts` (ล็อตของแถม) · `stock-pooled-promo.ts` · `promo-browse.ts` · `promo-group-display.ts` · `promo-group-label.ts` · `promo-title.ts` · `promo-inspector.ts` · `promo-month.ts` · `promo-vda-scope.ts` · `planner-utils.ts` |
| `calculations/` | `index.ts` (CVD, MIN/MAX, แนะนำสั่ง) · `price-override.ts` · `promo.ts` (ป้ายขั้นโปร) · `discount-consistency.ts` (ธงส่วนลดโปรกลุ่ม) |
| `stock/` | `filters.ts` · `sort.ts` · `export-order-form.ts` (Excel) · `thresholds-service.ts` · `threshold-rules.ts` · `threshold-defaults.ts` · `blocklist-service.ts` · `suggest-remaining.ts` · `cvd-hint.ts` · `browse-mode.ts` |
| `sales/` | `dashboard-queries.ts` · `dashboard-summary.ts` |
| `admin/` | `admin-nav.ts` · `audit-log.ts` (`recordAudit` ไม่โยน error) · `audit-log-labels.ts` · `vda-sales-directory.ts` · `db-explorer.ts` + `db-explorer-query.ts` (หน้า "ดูข้อมูลดิบ", ซ่อนคอลัมน์ลับ) |
| `repositories/` | `index.ts` (`getRepositories()`) · `prisma-repository.ts` (สร้างออเดอร์ dedupe ด้วย `clientRequestId`, อนุมัติ/ปฏิเสธ, แก้จำนวน/รอร้านยืนยัน) · `stock-mapper.ts` · `store-helpers.ts` · `types.ts` |

---

## 7. `hooks/`

| ไฟล์ | หน้าที่ |
|---|---|
| `use-focus-trap.ts` | กัก Tab ในกล่อง (ใช้ใน `Modal`/`ConfirmDialog` และ portal ที่เขียนเอง) |
| `use-async-action.ts` | ห่อ action async + สถานะ pending กันกดซ้ำ |
| `use-debounced-value.ts` | หน่วงค่าก่อนใช้เป็น queryKey |
| `use-data-version.ts` | poll `/api/data-version` |
| `use-sales-session.ts` · `use-sales-preview.ts` · `use-admin-preview.ts` | session/สถานะมุมมองทดสอบฝั่ง client |
| `use-vda-options.ts` · `use-vda-sales-directory.ts` | VDA ที่ดูแล / ทะเบียนเซลล์ |
| `use-promo-group-names.ts` | ชื่อกลุ่มโปร |

---

## 8. `prisma/`

| รายการ | รายละเอียด |
|---|---|
| `schema.prisma` | SQLite · model: `Store` `Sku` `StockItem` `PromoTier` `Order` `OrderItem` `PurchaseOrder` `PoSequence` `StoreNotification` `SalesNotification` `SalesNotificationRead` `AllowedSalesCode` `Admin` `StoreAccount` `StoreGroupThreshold` `StoreSkuBlock` `StoreSkuBlockRead` `VdaWarehouse` `SalesmanEmailAssignment` `AdminAuditLog` และ `SalesRep` (**คงตารางไว้แต่ไม่ใช้แล้ว** — `Store.salesRepId` ไม่มีโค้ดอ่าน) |
| `migrations/` | 30 โฟลเดอร์ ชื่อแบบ Prisma `YYYYMMDDHHMMSS_snake_case/migration.sql` + `migration_lock.toml` · ส่วนใหญ่สร้างด้วย `npm run db:migrate` ยกเว้น `20260826080500_seed_vda_warehouses` ที่เป็น data migration เขียนมือ · ล่าสุด `20260929021223_admin_audit_log` |
| `seed.ts` | `npm run db:seed` — **ไม่ได้สร้างข้อมูลตัวอย่าง แต่ลบ** ⚠️ ออเดอร์ `pending_approval` **ทุกใบ** + ร้าน/SKU demo (`ST*`) · ถูกเรียกใน `db:setup` และตอน `prisma migrate reset` (ตั้งไว้ใน `package.json` › `prisma.seed`) — อย่ารันกับฐานข้อมูลที่มีออเดอร์จริงรออยู่ |
| `dev.db` | ฐานข้อมูล dev (`DATABASE_URL="file:./dev.db"` นับจากโฟลเดอร์ prisma/) — ไม่อยู่ใน git |

---

## 9. `scripts/`

สคริปต์ `.ts` รันด้วย `tsx --env-file=.env` (อ่าน `.env`) · ตัวที่ไม่มี npm script ให้รัน `npx tsx --env-file=.env scripts/<ไฟล์>`

| ไฟล์ | วิธีรัน | หน้าที่ | ยิงออกนอกเครื่อง? |
|---|---|---|---|
| `check-dev.mjs` | อยู่ใน `npm run dev` | ตรวจว่า port 3000 ว่าง (Azure redirect ผูก 3000) | — |
| `stop-dev.mjs` | `npm run dev:stop` | kill process ที่ LISTEN port 3000 (Windows `netstat`/`taskkill`) | — |
| `backup-db.mjs` | `npm run backup:db` | `VACUUM INTO` ไปที่ `BACKUP_DIR` เก็บ `BACKUP_KEEP` ชุด (default 14) | — |
| `sync-fabric-masters.ts` | `npm run sync:masters [-- --interactive]` | ดึง master ทั้งหมดจาก OneLake ลง `data/cache` | อ่าน OneLake |
| `sync-masters-daily.bat` | `npm run sync:masters:daily` | ตัวช่วย Windows Task Scheduler (log ที่ `logs/sync-masters.log`) | อ่าน OneLake |
| `probe-stock-onelake.ts` | `npm run probe:stock-onelake` | ตรวจสิทธิ์/path ของ workspace stock | อ่าน OneLake |
| `probe-promo-cash.ts` | `npm run probe:promo-cash` | หาไฟล์ `cft_promotion_cash.csv` และ SP ที่อ่านได้ | อ่าน OneLake |
| `probe-cross-target.ts` | `npx tsx --env-file=.env scripts/probe-cross-target.ts` | สำรวจคอลัมน์ `cross_target_current_month.csv` (หัวไฟล์อ้าง `npm run probe:cross-target` ซึ่ง**ไม่มีใน package.json**) | อ่าน OneLake |
| `probe-sold-history.ts` | `npx tsx --env-file=.env …` | หาว่า `factsales_odoo.csv` อยู่ lakehouse ไหน | อ่าน OneLake |
| `probe-region-promos.ts` | `npm run probe:region-promos` | โปรเฉพาะภาคตกกับ SKU/คลังไหน (อ่าน cache) | — |
| `snapshot-promo-baseline.ts` | `npm run snapshot:promo -- out.json` | เก็บสรุปตาราง C4 ไว้เทียบก่อน/หลังเปลี่ยน | — |
| `verify-promo-context.ts` | `npm run verify:promo-context` | บริบทโปรของทุกคลัง/ร้านหาแถวเจอไหม | — |
| `verify-promo-parity.ts` | `npm run verify:promo-parity` | โปรหน้าร้าน vs หน้าแอดมินตรงกันไหม | — |
| `verify-sales-cover.ts` | `npm run verify:sales-cover` | ค่าเฉลี่ย 7/30 วันตรงกับ stock_cover_day ไหม (exit 1 ถ้าไม่ตรง) | — |
| `erp-payload-preview.ts` | `npm run erp:preview -- <PO>` / `-- --all` | เขียน payload ที่ **จะ** ส่งไว้ที่ `logs/erp-preview/` — ไม่ยิง | — |
| `create-demo-erp-order.ts` | `npx tsx --env-file=.env … [vda] [--special]` | สร้างออเดอร์ + PO ทดสอบใน DB เครื่องนี้ (ราคาสมมติ) — ไม่ยิง | — |
| `repair-new-sku-flags.ts` | `npx tsx --env-file=.env …` | one-shot ล้างป้าย "สินค้าใหม่" ที่ติดผิด (เขียน DB) | — |

---

## 10. `tests/`

| รายการ | รายละเอียด |
|---|---|
| `*.test.ts` (44 ไฟล์) | logic ล้วน — สูตร, กฎธุรกิจ, parser, สิทธิ์, nav |
| `*.db.test.ts` (15 ไฟล์) | ตรรกะ lib ที่เป็นทรานแซกชันจริง (อนุมัติพร้อมกัน, ERP stamp/clone/resolve, บัญชีร้าน, dedupe ออเดอร์ …) ใช้ SQLite ชั่วคราว |
| `helpers/test-db.ts` | `createTestDatabase()` (ไฟล์ใน temp + `prisma db push`), `setTestDatabaseUrl()` (ต้องเรียก **ก่อน** import โมดูล), `seedPendingOrder()` ฯลฯ |

ไฟล์ที่เขียนเอกสาร PO (`approve-with-split`, `approve-selected`, `erp-clone`) ต้อง `process.chdir()` ไป
โฟลเดอร์ temp ก่อน — ดู §12 เรื่อง `logs/po-export`

---

## 11. `notebooks/` · `docker/` · `docs/`

| รายการ | รายละเอียด |
|---|---|
| `notebooks/factsales_odoo_daily_etl.py` | Fabric notebook (PySpark) สร้าง `Files/exports/factsales_odoo.csv` ให้ค่าเฉลี่ยตรงกับ stock_cover_day — **เก็บไว้อ้างอิง รันบน Fabric** ไม่ได้ถูก build หรือเรียกจากแอป |
| `docker/Dockerfile` | 3 stage บน `node:20-bookworm-slim` (deps → builder: `prisma generate` + `npm run build` → runner: user `nextjs`, คัดลอก `.next` `prisma` `scripts` `instrumentation.ts`) · HEALTHCHECK `curl -fsSL …/vmi/api/health/` |
| `docker/entrypoint.sh` | สร้างโฟลเดอร์ → `backup-db.mjs` (ถ้า `VMI_BACKUP_ON_START=true`) → **`npx prisma migrate deploy`** → `next start` |
| `docker-compose.yml` | `DATABASE_URL=file:/app/data/vmi.db`, `FABRIC_CACHE_DIR`, `BACKUP_DIR`, `MASTER_REFRESH_ENABLED=true` · port `127.0.0.1:3002` · volume `vmi_data` `vmi_backups` `vmi_logs` · log rotate 10MB×5 |
| `docs/wiki/` | เอกสารชุดนี้ (00–12) · `NOTION-IMPORT.md` |
| `docs/IMPROVEMENT-PLAN.md` · `docs/ERP-PO-PLAN.md` | แผนงานค้าง / แผนงานส่ง PO เข้า ERP |

---

## 12. โฟลเดอร์ runtime (ไม่อยู่ใน git)

| path | ใครเขียน | หมายเหตุ |
|---|---|---|
| `data/cache/*.csv` | `runMasterRefresh` / `sync:masters` | ~100MB (ไฟล์ SKU ~68MB) · Docker ใช้ `/app/data/cache` |
| `data/logs/master-refresh-status.json` | `lib/fabric/refresh-status.ts` | override ด้วย `VMI_STATUS_DIR` |
| `logs/po-export/<PO>.json` | `writePoDocument` | ⚠️ path คือ **`process.cwd()/logs/po-export`** ไม่มี env ให้เปลี่ยน — ทุก process ที่รันจากราก repo (dev server, สคริปต์, เทสต์) เขียนลงโฟลเดอร์เดียวกัน เทสต์จึงต้อง `chdir` ไป temp · ใน Docker คือ volume `vmi_logs` |
| `logs/erp-preview/` | `npm run erp:preview` | payload พรีวิว |
| `backups/*.db` | `backup-db.mjs` (ตอน start container, หลังรอบ sync อัตโนมัติ, หรือสั่งเอง) | |
| `prisma/dev.db` | Prisma | ฐานข้อมูล dev |

---

## 13. การไหลของคำขอ (request flow)

### 13.1 ร้านส่งออเดอร์

```
components/stock/stock-page-client.tsx  (ตะกร้า → dialog ตรวจก่อนส่ง, clientRequestId, deliveryDate)
  → POST /vmi/api/orders/                                   app/api/orders/route.ts
      getAuthorizedStore()                                  ตัวตนจาก session ที่เซ็นแล้ว
      zod createOrderSchema · checkDeliveryDate()
      lookupOrderPromoLines()   lib/promo/lookup-order-lines.ts → ราคา C4 / ส่วนลด / ของแถม ณ ตอนส่ง
      evaluatePriceOverride / evaluatePooledDiscountConsistency → priceFlagged / discountFlagged
      getRepositories().orders.createOrder()                lib/repositories/prisma-repository.ts
          (แช่ค่า c4* ลง OrderItem · dedupe ด้วย clientRequestId → reused = ไม่แจ้งซ้ำ)
      notifySales({ kind: "order_created" })                lib/orders/sales-notify.ts (ไม่โยน error)
```

### 13.2 เซลล์อนุมัติ → PO → ERP

```
components/sales/sales-orders-client.tsx (+ po-split-panel: จัดกลุ่ม PO / partialItems)
  → PATCH /vmi/api/orders/ { action: "approve", groups, … }
      getSalesSession() · salesPreviewReadOnly() · assertOrderAccess()
      กันอนุมัติถ้ายังมีรายการรอร้านยืนยัน
      approveSelectedItems()  (ถ้าเลือกบางรายการ)           lib/po/approve-selected.ts
      approveWithPoSplit()                                  lib/po/approve-with-split.ts
          validatePoSplit → updateMany(status=pending_approval) จองสิทธิ์
          → nextPoSequence → buildPoDocument → writePoDocument (logs/po-export/<PO>.json)
          → สร้าง PurchaseOrder (status "issued") · ล้มกลาง = rollback สถานะ
      notifyStore({ kind: "approved" … })

หน้า PO  components/sales/po-detail-panel.tsx
  GET  /api/sales/purchase-orders/[po]?format=erp  → rebuildPoDocumentFromDb + buildErpPayload (พรีวิว ไม่ยิง)
  POST /api/sales/purchase-orders/[po]/send-erp    → ด่าน: session, preview, สิทธิ์, erpSentAt, replacedBy, erpError
        → erpEndpoint() (null = 503) → status "sending_erp"
        → deliverPoToErp()  lib/po/erp-delivery.ts: checkErpReadiness → POST (timeout 15s) → stampErp*()
        → สำเร็จ "sent_erp" · ไม่พร้อม/ถูกปฏิเสธ "issued" · timeout/เน็ต/HTTP "erp_unknown"
        → notifyErpSendResult()
  ถูกปฏิเสธ    → POST …/clone-for-erp   ออกเลขใหม่ เนื้อหาเดิม (ใบเก่าได้ replacedByPoNumber)
  erp_unknown → POST …/erp-resolve     คนยืนยันกับทีม ERP แล้วเลือก in_erp / not_in_erp + recordAudit
```

### 13.3 ข้อมูล master: Fabric/OneLake → cache → หน่วยความจำ

```
ทริกเกอร์: scheduler รายวัน (03:30 Asia/Bangkok) · ทุกชั่วโมงถ้า C4 ยังไม่มีเดือนนี้ (เฉพาะ C4)
           · catchUpIfStale ตอน boot · ปุ่มแอดมิน
           (/api/admin/refresh-masters) · ปุ่มร้าน (/api/stock/refresh) · CLI (npm run sync:masters)
  → runMasterRefresh()                   lib/fabric/scheduler.ts  (ทางเข้าเดียว, retry, alert-email)
      → datasets.ts รายการชุดข้อมูล → onelake-refresh.ts ดาวน์โหลด (ตรวจ header + ขั้นต่ำแถว)
      → เขียนทับ data/cache/*.csv · refresh-status.json · (รอบ scheduler) backup-db.mjs
  → ครั้งถัดไปที่มีคนเรียก getter ใน lib/fabric/index.ts: ensureFabricMastersFresh() เห็น mtime
    เปลี่ยน → โหลด CSV ใหม่เข้า registry ในหน่วยความจำ (CustomerDirectory, PromotionCredit,
    SkuMasterDirectory, SoldHistoryDirectory, AssortedMapping, cross-target, vda-aos-bill, …)
  → หน้าสต็อก: stock-rows.ts ประกอบแถวจาก stock_cover_day + SKU master + C4 + MIN/MAX ใน DB
    (syncStockCoverForStore สร้างแถว Sku ใน SQLite ให้ออเดอร์อ้าง FK ได้)
```

ข้อมูล master **อ่านอย่างเดียว** — ไม่มีโค้ดเขียนกลับ OneLake ส่วนข้อมูลที่ระบบสร้าง (ออเดอร์ PO บัญชี
แจ้งเตือน ทะเบียนคลัง/เซลล์ audit) อยู่ใน SQLite เท่านั้น

### 13.4 boot (`instrumentation.ts`, runtime nodejs)

`assertSessionSecret()` → `bootstrapAdminsFromEnv()` → `initVdaWarehouseRegistry()` →
`startMasterRefreshScheduler()` → `warmFabricMasters()` + `checkPromoContextCoverage()` →
`catchUpIfStale()` (ไม่ await)

---

[← 11 — คู่มือนักพัฒนา](./11-developer-guide.md) · [กลับหน้าแรก](./00-home.md)
