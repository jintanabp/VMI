[← กลับหน้าแรก](./00-home.md)

# 05 — API Reference

ทุก path มี basePath `/vmi` นำหน้าเสมอ (เช่น `/vmi/api/stock`)
ฝั่ง client ใช้ helper `appPath()` จาก `lib/paths.ts` อย่าต่อ string เอง

## สต็อกและออเดอร์

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/stock` | แถวสต็อกของร้านที่ล็อกอินอยู่ · param เดียวที่รับคือ `?fromDb=` |
| PATCH | `/api/stock` | แก้ MIN/MAX ราย SKU |
| POST | `/api/stock/refresh` | สั่งคำนวณสต็อกใหม่จาก cache |
| GET·POST | `/api/stock/export` | Excel ตามตัวกรอง/การเรียงที่เห็นบนจอ (POST เมื่อส่งจำนวนที่แก้ไว้มาด้วย) |
| GET | `/api/orders` | รายการออเดอร์ตามสิทธิ์ผู้เรียก · `status` `storeId` `salesRepId` `vdaCode` `allPersonVdas` |
| POST | `/api/orders` | ร้านส่งออเดอร์ใหม่ |
| PATCH | `/api/orders` | เซลล์: `approve` · `reject` · `updateQty` · `updatePrice` · `rejectItem` · `addItem` · `assignPoGroup` (≤ 2000 บรรทัด — "รวมเป็น PO เดียว" ส่งทุกบรรทัด; การย้ายบางรายการส่งกลุ่มที่เสนอของบรรทัดที่เหลือไปด้วย) |
| DELETE | `/api/orders?orderId=` | เซลล์ลบออเดอร์ · `?orderIds=` ลบหลายใบ · `?withPo=1` ลบที่ออก PO แล้วได้ · `?notify=0` ไม่แจ้งร้าน |
| DELETE | `/api/orders/clear-sku?skuCode=` | เคลียร์สิ้นเดือน: ลบบรรทัดของ SKU นี้จากทุกออเดอร์ `pending_approval` ที่ยังไม่มี PO ในขอบเขตสิทธิ์ · ใบที่ไม่เหลือบรรทัดถูกลบทั้งใบ · คิดโปรพี่น้องกลุ่มเดียวกันใหม่ · แจ้งร้าน `item_cleared` (`?notify=0` = ไม่แจ้ง) · คืน `{ itemsRemoved, ordersRemoved }` |

> **`?storeId=` ถูกลบออกจาก `/api/stock` แล้ว** — ตัวตนร้านมาจาก `getAuthorizedStore()`
> เท่านั้น มิฉะนั้นจะได้รับสถานะ 401 · เดิมพารามิเตอร์นี้ทำให้เรียกดูสต็อกของร้านอื่นได้
> โดยไม่ต้องมี session

### `POST /api/orders`
```jsonc
{ "items": [
  { "skuId": "...", "suggestedQty": 10, "finalQty": 8,
    "cvdEstimate": 12.5, "minDays": 7, "maxDays": 15 }
]}
```
Server จะ lookup โปร/ราคา C4 แล้ว**แช่ค่าไว้** — client ประกาศเองไม่ได้
**ร้านแก้ราคาไม่ได้แล้ว**: `unitPriceOverride` ที่ส่งมา (จากแท็บเก่า) ถูกทิ้งเงียบๆ ·
`deliveryDate` ไม่ต้องส่ง server คำนวณค่าตั้งต้นให้เอง · server แช่ `requestedQty = finalQty` ทุกบรรทัด

### `PATCH /api/orders` — action แก้รายการ
```jsonc
{ "orderId": "...", "action": "updateQty", "itemId": "...", "finalQty": 5 }
// ตอบกลับมา pendingConfirm ในแจ้งเตือน: finalQty > requestedQty → qtyIncreasePendingConfirm=true
{ "orderId": "...", "action": "rejectItem", "itemId": "...", "reason": "ของขาด" }  // reason ไม่บังคับ
{ "orderId": "...", "action": "addItem", "skuCode": "311050", "finalQty": 2 }
```
- `addItem` สร้างบรรทัดใหม่ `requestedQty=0` + `qtyIncreasePendingConfirm=true` เสมอ ·
  รหัสไม่มีในแคตตาล็อก → **400** · SKU ที่มีในออเดอร์แล้ว → **409** · อยู่กลุ่มโปรเดียวกับของเดิม → คำนวณ pooled ใหม่ทั้งกลุ่ม
  (ดู `lib/po/add-order-item.ts`) · แจ้งร้านด้วย kind `item_added_pending`
- `rejectItem` staff เท่านั้น — ตั้ง `finalQty=0` + `rejectedAt`/`rejectReason` แจ้งร้าน `item_rejected`

### `PATCH /api/orders` (approve)
```jsonc
{ "orderId": "...", "action": "approve", "poNumbers": { "A": "V2260731 01A" } }
```
`itemIds` (ไม่บังคับ) = อนุมัติเฉพาะรายการเหล่านี้ — ที่เหลือย้ายไปออเดอร์ใหม่รออนุมัติ
(`lib/po/approve-selected.ts`) · เลือกครึ่งกลุ่มโปรที่รวมยอด → **422** `issues` · ตอบกลับเพิ่ม
`remainderOrderId` / `remainderCount` · นับรายการรอร้านยืนยันเฉพาะใน `itemIds`

`poNumbers` ไม่ส่งก็ได้ ระบบ mint เลขให้เอง · อนุมัติได้เฉพาะสถานะ `pending_approval` (ไม่งั้น 409) ·
มีบรรทัด `qtyIncreasePendingConfirm=true` ค้างอยู่ → **422** (หน้าจอปิดปุ่มไว้ก่อนแล้ว แต่ server ตรวจซ้ำเสมอ)

## ฝั่งร้านค้า

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/store/order-history` | ประวัติออเดอร์ (`?summary=1&days=N` = สรุปราย SKU ไว้เตือนสั่งซ้ำ) |
| GET | `/api/sales/daily` | ยอดขายรายวันของ SKU · `?sku=` `?days=` (≤90) `?fromDb=` — **ใช้ session ของร้าน** ไม่ใช่ของเซลส์ · คืน `firstDate` + `coverageDays` ไว้ให้ UI ปิดช่วงที่ข้อมูลไม่ถึง |
| DELETE | `/api/store/orders?orderId=` | ร้านยกเลิกออเดอร์ตัวเอง (เฉพาะที่ยังไม่ถูกแตะ) |
| PATCH | `/api/store/orders` | ร้านตอบรายการที่รอยืนยัน (ออเดอร์ต้องยังรออนุมัติ ไม่งั้น **409**) `{ orderId, itemId, action: "confirmQtyIncrease" \| "rejectQtyIncrease" }` · สินค้าที่พนักงานเพิ่มเอง (`requestedQty=0`) ถ้าปฏิเสธ = **ลบทั้งแถว** + คำนวณโปรพี่น้องใหม่ · ของเดิม = คืน `finalQty` เป็น `requestedQty` · คืน `{ success, staffAdded, removed }` |
| GET·PATCH | `/api/store/notifications` | แจ้งเตือนจากพนักงาน · `?count=1` = เอาแค่จำนวน · `?since=` = เอาเฉพาะที่ใหม่กว่า |
| GET·PATCH | `/api/store/thresholds` | MIN/MAX ระดับกลุ่ม |
| GET·POST·DELETE | `/api/store/blocklist` | รายการหยุดสั่ง |

## ฝั่งเซลล์

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/sales/purchase-orders` | รายการ PO — `search` `priceKind` `status` `vdaCode` `allPersonVdas` `dateFrom` `dateTo` `sort` `dir` `page` `pageSize` |
| GET | `/api/sales/purchase-orders/[poNumber]` | Excel (default) · `?format=json` โหลดไฟล์ · `?format=view` อ่านบนเว็บ · `?format=erp` ดู payload ที่จะส่งเข้า ERP + ผลตรวจความพร้อม (อ่านอย่างเดียว ไม่ส่งอะไรออกไป) |
| PATCH | `/api/sales/purchase-orders/[poNumber]` | เปลี่ยนสถานะ PO |
| POST | `/api/sales/purchase-orders/export` | Excel หลายใบรวมไฟล์เดียว (สูงสุด 50) |
| GET·POST | `/api/sales/notifications` | ออเดอร์ใหม่จากร้าน + รายการหยุดสั่ง + คำตอบของร้านต่อรายการที่รอยืนยัน · แต่ละแถวมี `orderId` + `orderStatus` (null = ออเดอร์ถูกลบ) ให้กระดิ่งพาไปเปิดใบ · POST `{ type: "order" \| "block", ids? }` เพื่อรับทราบ |
| GET | `/api/sales/sku-search?q=&limit=` | ค้นสินค้าทั้งแคตตาล็อก (`item_barcode_map_v2`) ตามรหัส/บาร์โค้ด/ชื่อ/แบรนด์/หมวด · staff ทุก role · `q` สั้นกว่า 2 ตัว = ผลว่าง · `limit` ≤ 50 · คืน `{ results, total, capped, notReady }` (`notReady` = master ยังไม่โหลด ต่างจาก "ไม่พบ") |
| GET | `/api/sales/dashboard` | สรุปหน้าภาพรวม `?days=` (ค่าเริ่มต้น 30 สูงสุด 180) — pending, priceFlagged, อัตราอนุมัติ, ร้านธงแดง, รายการตัดสินล่าสุด |
| GET | `/api/sales/pending-count` | จำนวนออเดอร์รอตรวจ (สำหรับ badge) — ใช้ตัวนับเดียวกับ dashboard |
| DELETE | `/api/sales/purchase-orders?poNumbers=` | ลบ PO หลายใบ · `?notify=0` ไม่แจ้งร้าน |
| GET | `/api/sales/vda-access` | VDA ที่ผู้ใช้นี้ดูแล |
| POST | `/api/sales/active-code` | สลับรหัสเซลล์ที่ใช้งานอยู่ |
| POST | `/api/sales/order-promo` | คำนวณโปรของออเดอร์แบบสด (ใช้ในหน้าตรวจ) |

> `/api/sales/daily` อยู่ในตาราง "ฝั่งร้านค้า" ด้านบน — ชื่อที่ขึ้นต้นด้วย `sales`
> เป็นชื่อเดิมที่คงไว้ แต่ผู้เรียกใช้งานจริงคือหน้าจอของร้านค้า

> `?format=view` ประกอบเอกสารจาก DB ถ้าไฟล์บนดิสก์หาย — จึงดู PO ได้เสมอแม้ volume พัง
>
> `?format=erp` คืน `{ payload, readiness, context }` ตามสัญญา `insertOCROrderToBill`
> ของ ERP (ดู `lib/po/erp-payload.ts`) — **ยังไม่มีขาส่งจริงในระบบ** ต้องรอทีม ERP ยืนยัน
> `deliveryDate` และรอ UAT ก่อน เพราะยิง production ผิดใบเดียว คู่ orderNo+customerCode
> จะถูกล็อก 6 เดือน · ดูพรีวิวเป็นไฟล์ได้ด้วย `npm run erp:preview -- <poNumber|--all>`

## โปรโมชัน

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/promo/month` | โปร C4 เดือนปัจจุบันแยกตามคลัง · `?vdaCode=` (ไม่ส่ง = ทุกคลังที่มีสิทธิ์) · แอดมินเลือกได้ทุกคลัง เซลล์เฉพาะคลังที่ดูแล · ขอคลังนอกสิทธิ์ได้ **403** ไม่ใช่รายการว่าง |
| GET | `/api/promo/month/export` | Excel กลุ่มโปรของเดือน · `?vdaCode=` สิทธิ์แบบเดียวกับ `/api/promo/month` |
| POST | `/api/promo/lookup` | ขั้นโปรของ SKU ตามจำนวน |
| GET | `/api/promo/inspector` | เครื่องมือ debug ว่าทำไม SKU นี้ได้/ไม่ได้โปร |

## Auth

| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/api/auth/customer/login` | **admin เท่านั้น** (403 ถ้าไม่ใช่) · 503 ถ้ายังไม่ sync |
| POST | `/api/auth/customer/logout` | |
| POST | `/api/auth/store/login` | **rate limit** 10 ครั้ง/15 นาที ต่อ IP+อีเมล |
| POST | `/api/auth/store/request` · `/request-reset` | **rate limit** 5 ครั้ง/ชม. ต่อ IP |
| POST | `/api/auth/store/set-password` | รหัสอย่างน้อย 8 ตัวอักษร |
| GET·POST·DELETE | `/api/auth/msal/me` · `/api/auth/msal/session` | **login จริงของเซลส์/แอดมิน** |
| GET | `/api/auth/microsoft/login` · `/callback` | server-side flow เดิม — **ไม่มีใครเรียกแล้ว** |
| POST | `/api/auth/admin/preview-sales` · `/exit-sales-preview` · `/exit-preview` | |

> ชื่อ `msal` เป็นชื่อเดิมที่ติดมา — ตอนนี้เป็น route จัดการ session ธรรมดา ไม่ได้ใช้ไลบรารี MSAL แล้ว

## Admin

| Method | Path | หน้าที่ |
|---|---|---|
| GET·POST·DELETE | `/api/admin/admins` | รายชื่อ admin |
| GET·POST·PATCH·DELETE | `/api/admin/store-accounts` | บัญชีร้านค้า |
| GET·POST·DELETE | `/api/admin/store-blocklist` | หยุดสั่งระดับ admin |
| GET·PATCH | `/api/admin/store-thresholds` | MIN/MAX ระดับกลุ่ม |
| POST | `/api/admin/refresh-masters` | สั่ง sync Fabric |
| GET | `/api/admin/refresh-status` | สถานะ sync รอบล่าสุด |
| GET·PUT | `/api/admin/vda-warehouses` | ทะเบียนคลัง VDA (แทนการแก้ `VDA_CUSTOMER_MAP` ใน .env) |
| GET | `/api/admin/data-explorer/sources` · `/csv` · `/db` | เปิดดูไฟล์/ตารางที่ sync มา |
| GET | `/api/admin/promo/explain` | เหตุผลที่ SKU ได้/ไม่ได้โปร (รายงานรายเดือนย้ายไป `/api/promo/month`) |
| GET | `/api/admin/customers/search` · `/resolve` | ค้นหา/แปลงรหัสลูกค้า |
| GET | `/api/admin/salesmen` · `/api/admin/badges` | ข้อมูลประกอบหน้า admin |
| GET | `/api/admin/vda-sales` | ทะเบียนเซลล์ ↔ VDA · `codes[]` = หนึ่งแถวต่อรหัส `{ code, name, masterEmail, manual[{id,email}], vdas }` (รวมอีเมลอ้างอิงจาก `SalesmanEmailAssignment`) ใช้ในหน้า `/admin/system/vda-sales` · `people[]` / `vdas[]` ยังมีให้หน้าทดสอบมุมมองเซลล์ |
| GET·POST·DELETE | `/api/admin/salesman-assignments` | กำหนดอีเมล ↔ รหัสเซลล์เอง (`SalesmanEmailAssignment`) · POST `{ salesmanCode, emails: string[] }` (หรือ `email` เดี่ยว — ยังรับ) · มีแถว active = ทับการจับคู่อัตโนมัติจาก cross_target ทั้งหมด · มีผลตอน login ครั้งถัดไป |

## ทั่วไป

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/health` | health check สำหรับ Docker / nginx |
| GET | `/api/vda` | รายการ VDA ทั้งหมด — **ยังไม่ต้อง auth** (หน้า login ใช้ก่อนเข้าระบบ) |
| GET | `/api/data-version` | เวอร์ชันข้อมูลต่อร้าน ใช้ตัดสินว่าต้องล้าง cache ฝั่ง client ไหม |

## รหัสสถานะที่ใช้บ่อย

| Code | ความหมายในระบบนี้ |
|---|---|
| 401 | ยังไม่ล็อกอิน หรือ session หมดอายุ |
| 403 | ล็อกอินแล้วแต่ไม่มีสิทธิ์ — รวมถึงเรียก `/api/auth/customer/login` โดยไม่ใช่ admin |
| 409 | สถานะไม่ให้ทำ เช่น อนุมัติซ้ำ หรือบัญชีร้านต้องตั้งรหัสผ่านก่อน |
| 410 | เอกสาร PO อ่านไม่ได้ทั้งจากไฟล์และ DB |
| 422 | แบ่ง PO ไม่ผ่านกฎ (มี `issues` เป็นรายการข้อความไทย) |
| **429** | เรียกใช้เกินเพดานที่กำหนด (`/api/auth/store/*`) — มี header `Retry-After` |
| **503** | ยังไม่มีข้อมูล `stock_cover_day` — ต้อง sync ก่อนจึงจะ login ได้ |
