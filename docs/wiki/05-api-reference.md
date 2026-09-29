[← กลับหน้าแรก](./00-home.md)

# 05 — API Reference

ทุก route อยู่ใต้ `app/api/**/route.ts` (65 ไฟล์ — ตรวจกับโค้ด 29 ก.ย. 2569)

## ข้อตกลงของผู้เรียก

- **basePath `/vmi`** นำหน้าเสมอ (เช่น `/vmi/api/stock`) — ฝั่ง client ใช้ `appPath()` จาก `lib/paths.ts` อย่าต่อ string เอง
- **`trailingSlash: true`** (`next.config.ts`) — path ที่ไม่มี `/` ปิดท้ายได้ **308** ไปยัง path ที่มี `/` ·
  `fetch` ในเบราว์เซอร์ตามให้เองโดยคง method/body (308 ไม่เปลี่ยน POST เป็น GET) แต่เครื่องมือภายนอก
  (curl, สคริปต์) ต้องใส่ `/` ปิดท้าย เช่น `/vmi/api/health/` หรือใช้ `curl -L`
- ฝั่ง client เรียกผ่าน `apiFetch()` (`lib/api-fetch.ts`) — **401 = session หมด** ถูกโยนเป็น `UnauthorizedError`
  แล้วเด้งไปหน้า login · route จึงตอบ 403 (ไม่ใช่ 401) เมื่อ "ล็อกอินอยู่แต่ทำไม่ได้" เช่น รหัสผ่านเดิมผิด

### ใครเรียกได้ — คำย่อในคอลัมน์ "สิทธิ์"

| คำย่อ | ตัดสินด้วย | ความหมาย |
|---|---|---|
| **ร้าน** | `getAuthorizedStore()` / `getAuthorizedStoreId()` (`lib/auth/store-context.ts`) | store session ที่เซ็นแล้ว **หรือ** creator ที่อยู่ในโหมดเข้าดูร้าน (ดู [03](./03-authentication.md)) |
| **ร้าน (บัญชี)** | `getStoreSession()` | ร้านที่ล็อกอินด้วยอีเมล+รหัสผ่านเท่านั้น (โหมดเข้าดูร้านใช้ไม่ได้) |
| **เซลล์** | `getSalesSession()` | sales session ใดก็ได้ (creator / admin / เซลล์) · ถ้า creator อยู่ในมุมมองทดสอบเซลล์ จะเห็นเป็นเซลล์คนนั้น · ขอบเขตข้อมูลตาม รหัสเซลล์ → VDA |
| **เซลล์ (เขียน)** | `getSalesSession()` + `salesPreviewReadOnly()` | เหมือน "เซลล์" แต่ **มุมมองทดสอบเซลล์ได้ 403** เสมอ |
| **+SalesView** | `hasSalesView()` | admin ที่ไม่ได้ผูกรหัสเซลล์ได้ 403 "บัญชีนี้ไม่ได้ผูกกับรหัสเซลล์ — ใช้ได้เฉพาะหน้าตั้งค่า" |
| **Creator** | `getRawSalesSession()` + `role === "admin"` หรือ `isCreator()` | อีเมลใน `ADMIN_EMAILS` เท่านั้น · ใช้ raw session จึงทำได้แม้อยู่ในมุมมองทดสอบ |
| **`can(x)`** | `getRawSalesSession()` + `can(session, "x")` (`lib/auth/permissions.ts`) | Creator ผ่านเสมอ · Admin ผ่านเฉพาะสิทธิ์ใน `ADMIN_PERMISSIONS` |
| **สาธารณะ** | — | ไม่ตรวจ session |

สิทธิ์รายออเดอร์/PO ของเซลล์ตรวจด้วย `assertOrderAccess()` (`lib/orders/access.ts`) — ไม่อยู่ในขอบเขต = **403**

## สต็อกและออเดอร์

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/stock` | ร้าน | แถวสต็อกของร้านที่ล็อกอินอยู่ · param เดียวคือ `?fromDb=` (ค่าเริ่มต้น = รหัสร้าน) |
| PATCH | `/api/stock` | ร้าน | แก้ MIN/MAX ราย SKU `{ skuId, minDays, maxDays }` · คืนแถวที่แก้แล้ว |
| POST | `/api/stock/refresh` | ร้าน (ผ่าน `getCustomerStoreFromCookie`) | "ตรวจข้อมูลใหม่" — อ่านชุดข้อมูลกลางซ้ำ และสั่งดึง Fabric เบื้องหลังเฉพาะเมื่อเก่ากว่า `MASTER_REFRESH_MAX_AGE_HOURS` · คืน `{ queued, version, lastSuccessAt, message }` |
| GET·POST | `/api/stock/export` | ร้าน | Excel ใบสั่งตามตัวกรอง/การเรียงบนจอ (POST เมื่อส่งจำนวนที่แก้ไว้มาใน body) · **503** ถ้ายังไม่มี `stock_cover_day` |
| GET | `/api/orders` | เซลล์ +SalesView หรือ ร้าน | รายการออเดอร์ · มี sales session = ใช้ขอบเขตเซลล์ก่อนเสมอ · `status` `storeId` `vdaCode` `allPersonVdas=true` · `salesCode` (**Creator เท่านั้น** — กรองเป็นคลังของรหัสนั้นตามทะเบียน VDA และแปะ `store.salesCodes` ให้แต่ละใบ) · เซลล์ขอ `vdaCode` นอกขอบเขต → **403** · ไม่มี VDA ในความดูแล → `[]` |
| POST | `/api/orders` | ร้าน | ร้านส่งออเดอร์ใหม่ (ดูด้านล่าง) |
| PATCH | `/api/orders` | เซลล์ (เขียน) + `assertOrderAccess` | `approve` · `reject` · `updateQty` · `updatePrice` · `rejectItem` · `addItem` · `assignPoGroup` — ออเดอร์ต้อง `pending_approval` ไม่งั้น **409** |
| DELETE | `/api/orders?orderId=` | เซลล์ (เขียน) | ลบออเดอร์ · `?orderIds=a,b` หลายใบ (≤ 200) · `?withPo=1` ลบที่ออก PO แล้วได้ · `?notify=0` ไม่แจ้งร้าน · ใบที่ **อาจอยู่ใน ERP แล้ว** ลบไม่ได้เด็ดขาด (**409** `in_erp`) · ออก PO แล้วแต่ไม่ส่ง `withPo=1` → **409** `has_po` · จด audit `orders.delete` |
| DELETE | `/api/orders/clear-sku?skuCode=` | เซลล์ (เขียน) | เคลียร์สิ้นเดือน: ลบบรรทัดของ SKU นี้จากทุกออเดอร์ `pending_approval` ที่ยังไม่มี PO ในขอบเขตสิทธิ์ · `?vdaCode=` จำกัดเฉพาะคลังนั้น (ตัดกับขอบเขต) · ใบที่ไม่เหลือบรรทัดถูกลบทั้งใบ · คิดโปรพี่น้องกลุ่มเดียวกันใหม่ · แจ้งร้าน `item_cleared` (`?notify=0` = ไม่แจ้ง) · คืน `{ itemsRemoved, ordersRemoved }` |

> **`?storeId=` ถูกลบออกจาก `/api/stock` แล้ว** — ตัวตนร้านมาจาก `getAuthorizedStore()`
> เท่านั้น มิฉะนั้นได้ 401 · เดิมพารามิเตอร์นี้ทำให้เรียกดูสต็อกของร้านอื่นได้โดยไม่ต้องมี session

### `POST /api/orders`
```jsonc
{ "items": [
  { "skuId": "...", "suggestedQty": 10, "finalQty": 8,
    "cvdEstimate": 12.5, "minDays": 7, "maxDays": 15 }
  ],
  "clientRequestId": "draft-uuid",   // ไม่บังคับ · 8–64 ตัว · ส่งซ้ำด้วยค่าเดิม = ได้ใบเดิมกลับ (200) ไม่แจ้งเซลล์ซ้ำ
  "deliveryDate": "2026-10-02"       // ไม่บังคับ · YYYY-MM-DD ตรวจฝั่ง server (400 ถ้าผิดกฎ)
}
```
- `finalQty` 1–100,000 · SKU ซ้ำในใบ → 400 · `skuId` ที่ไม่มีจริง → 400
- Server lookup โปร/ราคา C4 แล้ว**แช่ค่าไว้** — client ประกาศเองไม่ได้ · แช่ `requestedQty = agreedQty = finalQty` ทุกบรรทัด
- **ร้านแก้ราคาไม่ได้แล้ว**: `unitPriceOverride` ที่ส่งมา (จากแท็บเก่า) ถูกทิ้งเงียบๆ
- `deliveryDate` หน้าจอส่งค่าตั้งต้น (วันนี้ + `LEAD_TIME_DAYS`) ให้เอง · **ไม่ส่ง = เก็บ `null`** (server ไม่เติมให้) —
  PO ของใบนั้นจะยังส่งเข้า ERP ไม่ได้ (ตัวตรวจความพร้อมบอกเหตุผล)
- สำเร็จ → แจ้งเซลล์ `order_created`

### `PATCH /api/orders` — action แก้รายการ
```jsonc
{ "orderId": "...", "action": "updateQty", "itemId": "...", "finalQty": 5 }
{ "orderId": "...", "action": "updatePrice", "itemId": "...", "unitPriceOverride": 120.5 } // null = ล้างราคาเซลล์
{ "orderId": "...", "action": "rejectItem", "itemId": "...", "reason": "ของขาด" }       // reason ไม่บังคับ ≤ 500
{ "orderId": "...", "action": "addItem", "skuCode": "311050", "finalQty": 2 }
{ "orderId": "...", "action": "assignPoGroup", "assignments": [{ "itemId": "...", "poGroup": "B" }] }
{ "orderId": "...", "action": "reject", "reason": "..." }
```
- `updateQty` — `finalQty: 0` → **400** (ให้ใช้ `rejectItem` แทน) · เพิ่มเกิน `agreedQty` → `qtyIncreasePendingConfirm=true`
  แจ้งร้าน `qty_increase_pending` · ลด/แก้ทั่วไป → `qty_changed` · จำนวนไม่เปลี่ยน = ไม่แจ้ง
- `addItem` สร้างบรรทัดใหม่ `requestedQty=0` + `qtyIncreasePendingConfirm=true` เสมอ ·
  รหัสไม่มีในแคตตาล็อก → **400** · SKU ที่มีในออเดอร์แล้ว → **409** · master ยังไม่โหลด → **503** ·
  อยู่กลุ่มโปรเดียวกับของเดิม → คำนวณ pooled ใหม่ทั้งกลุ่ม (ดู `lib/po/add-order-item.ts`) · แจ้งร้าน `item_added_pending`
- `rejectItem` — ตั้ง `finalQty=0` + `rejectedAt`/`rejectReason` แจ้งร้าน `item_rejected`
- `assignPoGroup` — `poGroup` ต้องเป็น `A`–`Z` · ≤ 2000 บรรทัดต่อคำขอ ("รวมเป็น PO เดียว" ส่งทุกบรรทัด;
  การย้ายบางรายการส่งกลุ่มที่เสนอของบรรทัดที่เหลือไปด้วย)
- `updatePrice` — ราคาไม่ผ่านเกณฑ์ → 400 · แจ้งร้าน `price_changed`
- `reject` — แจ้งร้าน `rejected` · ถูกตัดสินไปแล้วโดยคนอื่นระหว่างทาง → **409** `status: "decided"`

### `PATCH /api/orders` (approve)
```jsonc
{ "orderId": "...", "action": "approve", "poNumbers": { "A": "V2260731 01A" }, "itemIds": ["..."] }
```
- `poNumbers` ไม่ส่งก็ได้ ระบบ mint เลขให้เอง (≤ 12 ตัวต่อเลข)
- `itemIds` (ไม่บังคับ, ≤ 2000) = อนุมัติเฉพาะรายการเหล่านี้ — ที่เหลือย้ายไปออเดอร์ใหม่รออนุมัติ
  (`lib/po/approve-selected.ts`) · ตอบกลับเพิ่ม `remainderOrderId` / `remainderCount` · แจ้งร้าน `order_split`
- มีบรรทัด `qtyIncreasePendingConfirm=true` ค้าง (นับเฉพาะใน `itemIds` ถ้าส่งมา) → **422**
  (หน้าจอปิดปุ่มไว้ก่อนแล้ว แต่ server ตรวจซ้ำเสมอ)
- เลือกครึ่งกลุ่มโปรที่รวมยอด → **422** `{ error, issues[] }` · แบ่ง PO ไม่ผ่านกฎ → **422** `issues[]`
- ออเดอร์ถูกแก้ระหว่างทาง / ถูกตัดสินไปแล้ว → **409**
- สำเร็จ → แจ้งร้าน `approved` (รวมการออก PO ไว้ในแจ้งเตือนเดียว)

## ฝั่งร้านค้า

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/store/order-history` | ร้าน | ประวัติออเดอร์ · `?days=N` · `?summary=1` = สรุปราย SKU (มี `pendingQty` ไว้หักจำนวนแนะนำ / เตือนสั่งซ้ำ) |
| GET | `/api/sales/daily` | ร้าน (ผ่าน `getCustomerStoreFromCookie`) | ยอดขายรายวันของ SKU · `?sku=` (บังคับ) `?days=` (1–90, ค่าเริ่มต้น 7) `?fromDb=` — **ใช้ session ของร้าน ไม่ใช่ของเซลส์** · คืน `firstDate` + `coverageDays` ให้ UI ปิดช่วงที่ข้อมูลไม่ถึง |
| PATCH | `/api/store/orders` | ร้าน (ต้องเป็นเจ้าของออเดอร์) | ร้านตอบรายการที่รอยืนยัน `{ orderId, itemId, action: "confirmQtyIncrease" \| "rejectQtyIncrease" }` · ออเดอร์ต้องยังรออนุมัติ ไม่งั้น **409** · สินค้าที่พนักงานเพิ่มเอง (`requestedQty=0` และร้านยังไม่เคยยืนยัน) ถ้าปฏิเสธ = **ลบทั้งแถว** + คำนวณโปรพี่น้องใหม่ · นอกนั้น = คืน `finalQty` เป็น `agreedQty` (แถวเก่า: `requestedQty`) · แจ้งเซลล์ `qty_increase_*` / `item_added_*` · คืน `{ success, staffAdded, removed }` |
| DELETE | `/api/store/orders?orderId=` | ร้าน (ต้องเป็นเจ้าของ) | ร้านยกเลิกออเดอร์ตัวเอง — เฉพาะ `pending_approval` ที่ยังไม่มี PO (ไม่งั้น **409**) · ลบแจ้งเตือนของใบนั้นในทรานแซกชันเดียวกัน · แจ้งเซลล์ `order_cancelled` |
| GET·PATCH | `/api/store/notifications` | ร้าน | แจ้งเตือนจากพนักงาน · `?count=1` = แค่จำนวนที่ยังไม่อ่าน · `?count=1&since=<ISO>` = พร้อมรายการใหม่ (`fresh`) ไว้เด้ง toast · PATCH `{ ids? }` ทำเครื่องหมายอ่าน (ไม่ส่ง `ids` = ทั้งหมด · `ids` ไม่ใช่ array → 400) · **โหมดเข้าดูร้านของ creator ตอบสำเร็จแต่ไม่เขียน** |
| GET·PATCH | `/api/store/thresholds` | GET: ร้าน · PATCH: ร้าน (บัญชี) ที่ `canManageMinMax` | MIN/MAX ระดับกลุ่ม · ไม่มีสิทธิ์ → **403** · โหมดเข้าดูร้าน = ดูได้อย่างเดียว |
| GET·POST·DELETE | `/api/store/blocklist` | ร้าน | รายการหยุดสั่งของร้าน · ร้านที่ล็อกอินจัดการได้ทุกบัญชี · โหมดเข้าดูร้านบันทึกอีเมลคนที่เข้าดูเป็นผู้ตั้ง · ยกเลิกหยุดสั่ง = แจ้งเซลล์ `sku_unblocked` · body ตาม `lib/stock/blocklist-service.ts` |
| POST | `/api/promo/lookup` | ร้าน | ขั้นโปรของ SKU ตามจำนวน `{ lines: [{ skuCode, qty }] }` · **503** ถ้า master โปรยังไม่โหลด |

> `/api/sales/daily` อยู่ในตารางนี้ — ชื่อที่ขึ้นต้นด้วย `sales` เป็นชื่อเดิมที่คงไว้
> แต่ผู้เรียกใช้งานจริงคือหน้าจอของร้านค้า

## ฝั่งเซลล์

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/sales/purchase-orders` | เซลล์ | รายการ PO — `search` (เลข PO / รหัส / ชื่อร้าน) `priceKind` `status` `vdaCode` `allPersonVdas=true` `dateFrom` `dateTo` (YYYY-MM-DD = ทั้งวันเวลาไทย) `sort` (`issuedAt` \| `amount` \| `poNumber`) `dir` `page` `pageSize` (ค่าเริ่มต้น 50 สูงสุด 200) · คลังนอกขอบเขต → **403** |
| DELETE | `/api/sales/purchase-orders?poNumbers=A,B` | เซลล์ (เขียน) | ลบ PO หลายใบ (≤ 200) = ลบออเดอร์ต้นทางทั้งใบ · `?notify=0` ไม่แจ้งร้าน · อาจอยู่ใน ERP แล้ว → **409** · คืน `missing` + `skipped` ของที่ลบไม่ได้ |
| POST | `/api/sales/purchase-orders/export` | เซลล์ | Excel หลายใบรวมไฟล์เดียว `{ poNumbers: [...] }` (1–50) · มีใบนอกสิทธิ์ → 403 |
| GET | `/api/sales/purchase-orders/[poNumber]` | เซลล์ + `assertOrderAccess` | Excel (default) · `?format=json` โหลดไฟล์ · `?format=view` อ่านบนเว็บ · `?format=erp` ดู payload ที่จะส่งเข้า ERP + ผลตรวจความพร้อม (**อ่านอย่างเดียว ไม่ส่งอะไรออกไป**) · อ่านไม่ได้ทั้งไฟล์และ DB → **410** |
| PATCH | `/api/sales/purchase-orders/[poNumber]` | เซลล์ (เขียน) + `assertOrderAccess` | เปลี่ยนสถานะ PO ด้วยมือ `{ status, note? }` · ตั้งสถานะ ERP เอง (`sending_erp` `sent_erp` `erp_unknown`) → **400** · ใบกำลังส่ง ERP → **409** · ใบที่อาจอยู่ใน ERP แล้วเปลี่ยนได้แค่เป็น `received` (อย่างอื่น **409**) · ชนกับการเปลี่ยนอื่น (compare-and-set) → **409** · แจ้งร้าน `po_cancelled` / `po_received` / `po_reopened` (ดู `checkManualPoStatusChange` ใน `lib/po/po-status.ts`) |
| POST | `/api/sales/purchase-orders/[poNumber]/send-erp` | เซลล์ (เขียน) + `assertOrderAccess` | ⚠️ **route เดียวที่ยิงออกนอกเครื่อง** (ERP `insertOCROrderToBill`) — ดูกล่องด้านล่าง |
| POST | `/api/sales/purchase-orders/[poNumber]/erp-resolve` | เซลล์ (เขียน) + `assertOrderAccess` | แก้สถานะ "ERP ไม่ตอบ — รอตรวจ" (`erp_unknown`) หลังตรวจกับทีม ERP · `{ resolution: "in_erp" \| "not_in_erp", note }` (note 3–300 ตัว บังคับ) · **ไม่ยิงออกนอกเครื่อง** — แค่บันทึกคำตอบ · `in_erp` = ปักว่าส่งสำเร็จ + แจ้งร้าน `po_sent_erp` · `not_in_erp` = ล้างผลส่งครั้งก่อน ส่งใหม่ได้ด้วยเลขเดิม · ไม่ได้อยู่ในสถานะนั้น / ส่งแล้ว / ถูกแทนที่ / กำลังส่ง / ถูกแก้ระหว่างทาง → **409** · จด audit `po.erpResolve` |
| POST | `/api/sales/purchase-orders/[poNumber]/clone-for-erp` | เซลล์ (เขียน) + `assertOrderAccess` | ขอเลข PO ใหม่ให้ใบที่ **ERP ปฏิเสธชัดเจน** (`erpFailureKind = "rejected"`) — ใบเดิมถูกปัก `replacedByPoNumber` · ผลไม่ชัดเจน (timeout/network) / ส่งสำเร็จแล้ว / เคยขอเลขใหม่แล้ว / ไม่มีรายการ / แพ้การแข่งกัน → **409** · แจ้งร้าน `po_replaced` |
| GET·POST | `/api/sales/notifications` | GET: เซลล์ +SalesView · POST: เซลล์ (เขียน) | ออเดอร์ใหม่จากร้าน + รายการหยุดสั่ง + คำตอบของร้านต่อรายการที่รอยืนยัน · แต่ละแถวมี `orderId` + `orderStatus` (null = ออเดอร์ถูกลบ) · สถานะอ่านแล้ว**ต่อผู้ใช้** · POST `{ type: "order" \| "block", ids? }` รับทราบ (ไม่ส่ง `type` = `block` · ไม่ส่ง `ids` = ทุกแถวที่เห็น ≤ 200) |
| GET | `/api/sales/dashboard` | เซลล์ +SalesView | สรุปหน้าภาพรวม `?days=` (ค่าเริ่มต้น 30 สูงสุด 180) — pending, priceFlagged, อัตราอนุมัติ, ร้านธงแดง, รายการตัดสินล่าสุด |
| GET | `/api/sales/pending-count` | เซลล์ +SalesView | จำนวนออเดอร์รอตรวจ (badge) `{ pending, priceFlagged }` — ตัวนับเดียวกับ dashboard |
| GET | `/api/sales/sku-search?q=&limit=` | เซลล์ (raw session ทุก role) | ค้นสินค้าทั้งแคตตาล็อก (`item_barcode_map_v2`) ตามรหัส/บาร์โค้ด/ชื่อ/แบรนด์/หมวด · `q` สั้นกว่า 2 ตัว = ผลว่าง · `limit` ≤ 50 · คืน `{ results, total, capped, notReady }` (`notReady` = master ยังไม่โหลด ต่างจาก "ไม่พบ") |
| GET | `/api/sales/vda-access` | เซลล์ | VDA ที่ผู้ใช้นี้ดูแล + `allPersonVdas` (ทุกคลังของทุกรหัสที่ผูกกับอีเมล) · Creator ได้ `isAdmin: true` + `vdas: []` |
| POST | `/api/sales/active-code` | เซลล์ (raw) | สลับรหัสเซลล์ที่ใช้อยู่ `{ code }` — ได้เฉพาะรหัสใน `session.manualCodes` (ผูกไว้ใน `SalesmanEmailAssignment`) แล้วเซ็น cookie ใหม่ · Creator ในมุมมองทดสอบ = สลับรหัสของมุมมองทดสอบ (รหัสต้องผูกกับอีเมลที่ทดสอบ) · Creator ปกติ → 403 |
| POST | `/api/sales/order-promo` | เซลล์ | คำนวณโปรของออเดอร์แบบสด (หน้าตรวจ) `{ storeCode, lines: [{ skuCode, qty }] }` · **503** ถ้า master โปรยังไม่โหลด |

> **`POST …/send-erp` — จุดเดียวที่ข้อมูลออกนอกเครื่อง** (`lib/po/erp-delivery.ts`, ปลายทางใน `lib/po/erp-endpoint.ts`)
> ด่านกันซ้อน: ต้องมีสิทธิ์ในออเดอร์ต้นทาง · มุมมองทดสอบห้าม (403) · เคยส่งสำเร็จ (`erpSentAt`) / ถูกแทนที่ /
> เคยส่งไม่สำเร็จ (`erpError` — ถูกปฏิเสธต้องขอเลขใหม่, ผลไม่ชัดเจนต้องไป `erp-resolve`) → **409** ·
> ปลายทางตอนนี้ = **UAT** (`ERP_UAT_URL`, timeout 15 วิ) · สวิตช์ปิด (`SEND_ENABLED` ในโค้ด หรือเบรกฉุกเฉิน
> `ERP_SEND_DISABLED=1` ซึ่งปิดได้อย่างเดียว เปิดไม่ได้) → **503** · ประทับผลด้วย compare-and-set
> (กดพร้อมกันยิงได้ครั้งเดียว) · **ไม่มี auto-retry** · ส่งแล้วไม่รู้ผล → สถานะ `erp_unknown` แจ้งเซลล์ `erp_failed`
>
> **ห้ามยิง endpoint นี้เพื่อทดสอบ** — ยิงผิดใบเดียว คู่ orderNo+customerCode จะถูกล็อก 6 เดือน ·
> ดู payload ได้โดยไม่ส่งด้วย `GET …/[poNumber]?format=erp` หรือ `npm run erp:preview -- <poNumber|--all>`

> `?format=view` ประกอบเอกสารจาก DB ถ้าไฟล์บนดิสก์หาย — จึงดู PO ได้เสมอแม้ volume พัง ·
> `?format=erp` คืน `{ payload, readiness, context }` ตามสัญญา `insertOCROrderToBill` (`lib/po/erp-payload.ts`)

## โปรโมชัน

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/promo/month` | เซลล์ | โปร C4 เดือนปัจจุบันแยกตามคลัง · `?vdaCode=` (ไม่ส่ง / `all` = ทุกคลังที่มีสิทธิ์) · ทุกคลังเมื่อ `can(promotions.view)` (Creator + Admin) เซลล์เฉพาะคลังที่ดูแล · ขอคลังนอกสิทธิ์ → **403** ไม่ใช่รายการว่าง · ไม่มีคลังในความดูแล → 200 `reason: "no_vda"` |
| GET | `/api/promo/month/export` | เซลล์ | Excel กลุ่มโปรของเดือน · `?vdaCode=` สิทธิ์แบบเดียวกับ `/api/promo/month` · ไม่มีคลัง → 400 · โปรยังไม่โหลด → 503 |
| GET | `/api/promo/inspector` | ร้าน (ร้านตัวเอง) หรือ เซลล์ | debug ว่าทำไม SKU/กลุ่มนี้ได้/ไม่ได้โปร · `?sku=` หรือ `?group=` (อย่างใดอย่างหนึ่ง) `?storeCode=` (ไม่ส่ง = ร้านของ session) · `can(promotions.view)` ดูได้ทุกคลัง · เซลล์เฉพาะคลัง VDA ในขอบเขต (fail closed) |
| GET | `/api/promo/assorted-names` | สาธารณะ | ชื่อกลุ่มโปรทั้งชุด (รหัส → ชื่อ) `{ names, count, version }` — ไม่มีข้อมูลลูกค้า/ราคา |

## Auth

รายละเอียดกลไกอยู่ที่ [03 — การยืนยันตัวตน](./03-authentication.md)

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/api/auth/store/request` | สาธารณะ | ร้านกรอกอีเมล `{ email, vdaCode? }` — ยังไม่มีบัญชี = สร้างคำขอ `pending` (ต้องมี `vdaCode`) · มีแล้ว = คืน `step` (`pending` \| `rejected` \| `set-password` \| `login`) · **rate limit** 5 ครั้ง/ชม. ต่อ IP |
| POST | `/api/auth/store/set-password` | สาธารณะ | ตั้งรหัสครั้งแรก/หลังรีเซ็ต `{ email, setupCode, password }` แล้วล็อกอินให้เลย · รหัสผ่าน 8–128 ตัว · อีเมลไม่มีบัญชีกับรหัสตั้งค่าผิดตอบข้อความเดียวกัน (400) · ยังไม่อนุมัติ 403 · ตั้งแล้ว / ไม่มี VDA 409 · **rate limit** 5 ครั้ง/15 นาที ต่ออีเมล + 20 ครั้ง/15 นาที ต่อ IP |
| POST | `/api/auth/store/login` | สาธารณะ | `{ email, password }` · ผิด 401 · ถูกปฏิเสธ 403 `step: "rejected"` · รออนุมัติ 403 `step: "pending"` · ต้องตั้งรหัสก่อน **409** `step: "set-password"` · **rate limit** 10 ครั้ง/15 นาที ต่อ IP+อีเมล · ไม่ต้องรอข้อมูล Fabric |
| POST | `/api/auth/store/change-password` | ร้าน (บัญชี) | `{ currentPassword, newPassword }` — อีเมลมาจาก session เท่านั้น · รหัสเดิมผิด **403** (ไม่ใช่ 401 โดยตั้งใจ) · ซ้ำรหัสเดิม / อ่อน 400 · ยังไม่เคยตั้งรหัส 409 · สำเร็จ = session เครื่องอื่นหลุดทั้งหมด เครื่องนี้ได้ cookie ใหม่ · **rate limit** 10 ครั้ง/15 นาที ต่อ IP+อีเมล |
| POST | `/api/auth/store/request-reset` | สาธารณะ | บันทึก `resetRequestedAt` ให้แอดมินเห็น — ตอบเหมือนกันเสมอไม่ว่ามีบัญชีหรือไม่ · **rate limit** 5 ครั้ง/ชม. ต่อ IP |
| POST | `/api/auth/customer/login` | **Creator เท่านั้น** (403) | โหมดเข้าดูร้าน `{ vda }` — ตั้ง `vmi_store_id` + `vmi_store_code` + `vmi_admin_preview` · VDA ไม่มีจริง 404 · **503** ถ้ายังไม่ sync `stock_cover_day` |
| POST | `/api/auth/customer/logout` | — | ลบ `vmi_store_id` `vmi_store_code` `vmi_store_session` |
| POST·DELETE | `/api/auth/msal/session` | POST: สาธารณะ | **login จริงของเซลล์/แอดมิน** — POST `{ idToken }` (JSON หรือ form) ตรวจลายเซ็นกับ JWKS ของ tenant ก่อน (ผิด 401) · อีเมลไม่มีสิทธิ์ 403 · คืน `{ ok, user, redirectTo }` + ตั้ง `vmi_sales_session` (form = redirect 303) · DELETE = logout |
| GET | `/api/auth/msal/me` | เซลล์ | session ปัจจุบัน (หลังซ้อนมุมมองทดสอบ) |
| GET | `/api/auth/microsoft/login` · `/callback` | สาธารณะ | server-side OAuth flow เดิม (`lib/auth/microsoft-oauth.ts`) — **หน้าเว็บไม่เรียกแล้ว** แต่ยังทำงานได้ |
| POST | `/api/auth/admin/preview-sales` | Creator | เปิดมุมมองทดสอบเซลล์ `{ email, code? }` (ใช้รหัสที่ผูกกับอีเมลนั้น) หรือ `{ code }` อย่างเดียว (รหัสในทะเบียน VDA ที่ยังไม่มีคนผูก) · ไม่พบ 404 |
| POST | `/api/auth/admin/exit-sales-preview` | Creator | ลบ cookie มุมมองทดสอบเซลล์ |
| POST | `/api/auth/admin/exit-preview` | Creator | ออกจากโหมดเข้าดูร้าน → redirect 303 ไป `/admin` |
| GET | `/api/dev/login?email=` | **dev เท่านั้น** | ออก sales session โดยไม่ผ่าน Microsoft — เปิดเมื่อ ไม่ใช่ production **และ** `DEV_LOGIN=1` **และ** host เป็น localhost/127.0.0.1/[::1] · ไม่ครบ = 404 · สิทธิ์คำนวณด้วย `buildSalesSessionWithAccess` ตัวจริง |

> ชื่อ `msal` เป็นชื่อเดิมที่ติดมา — ตอนนี้เป็น route จัดการ session ธรรมดา ไม่ได้ใช้ไลบรารี MSAL แล้ว

## Admin

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/admin/badges` | Creator หรือ Admin (`hasSettingsAccess`) | ตัวเลขบนเมนูตั้งค่า `{ storePending, syncFailed, promoReady }` (`syncFailed` เห็นเฉพาะ Creator) |
| GET·POST·PATCH·DELETE | `/api/admin/store-accounts` | GET `can(stores.view)` · POST `can(stores.create)` · PATCH ตาม action · DELETE Creator | บัญชีร้านค้า · POST `{ email, vdaCode, canManageMinMax? }` (min/max ติ๊กได้เฉพาะ Creator) คืน `setupCode` ครั้งเดียว · PATCH `{ email, action, … }` — `approve` (+`vdaCode`) · `reset-password` (Admin ทำได้สองอันนี้ — approve เฉพาะที่ `pending`, reset เฉพาะที่ `approved`) · `reject` `set-vda` `set-can-manage` `set-email` (+`newEmail`) = Creator · DELETE `?email=` · Admin ไม่เห็นบัญชีที่ถูกปฏิเสธ · จด audit `store.*` |
| GET | `/api/admin/vda-sales` | `can(salesCodes.view)` | ทะเบียนเซลล์ ↔ VDA · `codes[]` = หนึ่งแถวต่อรหัส `{ code, name, manual[{id,email}], vdas }` (อีเมลจาก `SalesmanEmailAssignment` เท่านั้น) · `canAddEmail` / `canRemoveEmail` ไว้ซ่อนปุ่ม · `people[]` / `vdas[]` ใช้ในหน้าทดสอบมุมมองเซลล์ |
| GET·POST·DELETE | `/api/admin/salesman-assignments` | GET/DELETE Creator · POST `can(salesCodes.addEmail)` | กำหนดอีเมล ↔ รหัสเซลล์ (`SalesmanEmailAssignment`) — **แหล่งเดียวของรหัสเซลล์ของอีเมล** · POST `{ salesmanCode, emails: string[] }` (1–50, หรือ `email` เดี่ยว — ยังรับ) · Admin ใส่อีเมลที่เป็นผู้ดูแลระบบไม่ได้ (403) · DELETE `?id=` ลบแถวจริง · มีผลใน request ถัดไป ไม่ต้อง login ใหม่ · คืน `{ assignments }` · จด audit `salesCode.assign/unassign` |
| GET | `/api/admin/sales-codes` | Creator | ตัวเลือก "กรองตามรหัสเซลล์" ในหน้าออเดอร์ — รหัสที่ดูแลคลังอยู่ `[{ code, vdas, emails }]` (**แทน `/api/admin/salesmen` ที่ลบไปแล้ว**) |
| GET·POST·DELETE | `/api/admin/admins` | Creator | รายชื่อ Admin (ตาราง `Admin`) · POST `{ email }` · DELETE `?email=` (ลบคนที่มาจาก `ADMIN_EMAILS` ไม่ได้ → 400) · จด audit `admin.add/remove` |
| GET | `/api/admin/audit-log?q=&action=&after=` | Creator | บันทึกการทำงาน · ใหม่สุดก่อน ครั้งละ 100 · `action` ต้องอยู่ใน `AUDIT_ACTION_LABELS` (ไม่งั้น 400) · `after` = id แถวสุดท้ายของหน้าก่อน (id ไม่มีจริง → 400) |
| GET·POST·DELETE | `/api/admin/store-blocklist?storeId=\|storeCode=` | Creator | หยุดสั่งแทนร้าน · ไม่ระบุร้าน 400 · ไม่พบ 404 · จด audit `blocklist.*` |
| GET·PATCH | `/api/admin/store-thresholds?storeId=\|storeCode=` | Creator | MIN/MAX ระดับกลุ่ม/ราย SKU แทนร้าน (`section` / `sections[]` / `skuId`, `reset`) · จด audit `thresholds.update` |
| GET·PUT | `/api/admin/vda-warehouses` | Creator | ทะเบียนคลัง VDA `{ warehouses: [{ code, customerCodes[], label?, active? }] }` (≤ 64 · รหัสซ้ำ 400) — แทนการแก้ `VDA_CUSTOMER_MAP` ใน .env · จด audit `warehouses.save` |
| GET | `/api/admin/customers/search?q=&limit=` | Creator | ค้นลูกค้าจาก `dim_customer` (ชื่อ/จังหวัด/เลขผู้เสียภาษี) ตอนเพิ่มคลังใหม่ |
| GET | `/api/admin/customers/resolve?codes=` | Creator | รหัสลูกค้า → ชื่อบริษัท ใต้ช่องกรอกในหน้าทะเบียนคลัง |
| POST | `/api/admin/refresh-masters` | Creator | สั่ง sync Fabric `{ datasets? }` (ไม่ส่ง = ทุกชุด) · ชุดที่ไม่รู้จัก 400 · มีรอบกำลังทำงาน **409** · จด audit `masters.refresh` |
| GET | `/api/admin/refresh-status` | Creator | สถานะ sync รอบล่าสุด + inventory ของชุดข้อมูล (`?rows=1` นับจำนวนแถวด้วย) |
| GET | `/api/admin/data-explorer/sources` · `/csv` · `/db` | Creator | เปิดดูไฟล์/ตารางที่ sync มา · `/csv?dataset=&offset=&limit=&q=&column=&v=` (allowlist รหัสชุดข้อมูล ไม่รับ path) · `/db?model=&offset=&limit=(≤500)&sort=&dir=&q=` |
| GET | `/api/admin/promo/explain?sku=&store=` | Creator | เหตุผลที่ SKU ได้/ไม่ได้โปรบนเครื่องที่รันอยู่ พร้อม mtime ของไฟล์ (รายงานรายเดือนอยู่ที่ `/api/promo/month`) |

## ทั่วไป

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| GET | `/api/health` | สาธารณะ | health check สำหรับ Docker / nginx — `{ ok, database, stores, fabric{…}, scheduler{…} }` · DB ล้ม = 500 |
| GET | `/api/vda` | สาธารณะ | รายการ VDA `{ sources, names, filterMode }` — หน้า login ใช้ก่อนเข้าระบบ |
| GET | `/api/data-version` | สาธารณะ | `{ version, dataDate, lastSuccessAt, refreshing }` ทุกแท็บ poll ไว้ตัดสินว่าต้องโหลดข้อมูลใหม่ไหม · ไม่แตะ DB |

## รหัสสถานะที่ใช้บ่อย

| Code | ความหมายในระบบนี้ |
|---|---|
| 308 | เรียก path ที่ไม่มี `/` ปิดท้าย (`trailingSlash: true`) — ตามไปที่ path ที่มี `/` |
| 401 | ยังไม่ล็อกอิน หรือ session หมดอายุ/ถูกเพิกถอน (`apiFetch` เด้งไปหน้า login) |
| 403 | ล็อกอินแล้วแต่ไม่มีสิทธิ์ — รวมถึง **มุมมองทดสอบเซลล์ที่พยายามเขียน**, admin ที่ไม่มีรหัสเซลล์เรียก API หน้าเซลล์, รหัสผ่านเดิมผิดตอนเปลี่ยนรหัส |
| 404 | ไม่พบ — และ `/api/dev/login` เมื่อไม่ได้เปิด |
| 409 | สถานะไม่ให้ทำ เช่น อนุมัติซ้ำ, ออเดอร์ไม่ใช่ `pending_approval`, PO อาจอยู่ใน ERP แล้ว, ชนกับการแก้อื่น (compare-and-set), บัญชีร้านต้องตั้งรหัสผ่านก่อน, sync กำลังทำงาน |
| 410 | เอกสาร PO อ่านไม่ได้ทั้งจากไฟล์และ DB |
| 422 | อนุมัติไม่ได้ — มีรายการรอร้านยืนยัน, เลือกครึ่งกลุ่มโปร, แบ่ง PO ไม่ผ่านกฎ (มี `issues` เป็นรายการข้อความไทย) |
| **429** | เรียกเกินเพดาน (`/api/auth/store/*`) — มี header `Retry-After` · นับจาก IP ใน `x-real-ip` |
| **503** | ข้อมูล/ความสามารถยังไม่พร้อม — ยังไม่มี `stock_cover_day` (เข้าดูร้าน / export), master โปร/สินค้ายังไม่โหลด, หรือสวิตช์ส่ง ERP ปิดอยู่ |
