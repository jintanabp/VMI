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
| PATCH | `/api/orders` | เซลล์: `approve` · `reject` · `updateQty` · `updatePrice` · `assignPoGroup` |
| DELETE | `/api/orders?orderId=` | เซลล์ลบออเดอร์ · `?orderIds=` ลบหลายใบ · `?withPo=1` ลบที่ออก PO แล้วได้ · `?notify=0` ไม่แจ้งร้าน |

> **`?storeId=` ถูกลบออกจาก `/api/stock` แล้ว** — ตัวตนร้านมาจาก `getAuthorizedStore()`
> เท่านั้น มิฉะนั้นจะได้รับสถานะ 401 · เดิมพารามิเตอร์นี้ทำให้เรียกดูสต็อกของร้านอื่นได้
> โดยไม่ต้องมี session

### `POST /api/orders`
```jsonc
{ "items": [
  { "skuId": "...", "suggestedQty": 10, "finalQty": 8,
    "cvdEstimate": 12.5, "minDays": 7, "maxDays": 15,
    "unitPriceOverride": null }   // รับแค่ราคาที่ร้านแก้ ที่เหลือ server เติมเอง
]}
```
Server จะ lookup โปร/ราคา C4 แล้ว**แช่ค่าไว้** — client ประกาศเองไม่ได้

### `PATCH /api/orders` (approve)
```jsonc
{ "orderId": "...", "action": "approve", "poNumbers": { "A": "V2260731 01A" } }
```
`poNumbers` ไม่ส่งก็ได้ ระบบ mint เลขให้เอง · อนุมัติได้เฉพาะสถานะ `pending_approval` (ไม่งั้น 409)

## ฝั่งร้านค้า

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/store/order-history` | ประวัติออเดอร์ (`?summary=1&days=N` = สรุปราย SKU ไว้เตือนสั่งซ้ำ) |
| GET | `/api/sales/daily` | ยอดขายรายวันของ SKU · `?sku=` `?days=` (≤90) `?fromDb=` — **ใช้ session ของร้าน** ไม่ใช่ของเซลส์ · คืน `firstDate` + `coverageDays` ไว้ให้ UI ปิดช่วงที่ข้อมูลไม่ถึง |
| DELETE | `/api/store/orders?orderId=` | ร้านยกเลิกออเดอร์ตัวเอง (เฉพาะที่ยังไม่ถูกแตะ) |
| GET·PATCH | `/api/store/notifications` | แจ้งเตือนจากพนักงาน · `?count=1` = เอาแค่จำนวน · `?since=` = เอาเฉพาะที่ใหม่กว่า |
| GET·PATCH | `/api/store/thresholds` | MIN/MAX ระดับกลุ่ม |
| GET·POST·DELETE | `/api/store/blocklist` | รายการหยุดสั่ง |

## ฝั่งเซลล์

| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/sales/purchase-orders` | รายการ PO — `search` `priceKind` `status` `vdaCode` `allPersonVdas` `dateFrom` `dateTo` `sort` `dir` `page` `pageSize` |
| GET | `/api/sales/purchase-orders/[poNumber]` | Excel (default) · `?format=json` โหลดไฟล์ · `?format=view` อ่านบนเว็บ |
| PATCH | `/api/sales/purchase-orders/[poNumber]` | เปลี่ยนสถานะ PO |
| POST | `/api/sales/purchase-orders/export` | Excel หลายใบรวมไฟล์เดียว (สูงสุด 50) |
| GET·POST | `/api/sales/notifications` | ออเดอร์ใหม่จากร้าน + รายการหยุดสั่ง · POST เพื่อรับทราบ |
| GET | `/api/sales/dashboard` | สรุปหน้าภาพรวม `?days=` (ค่าเริ่มต้น 30 สูงสุด 180) — pending, priceFlagged, อัตราอนุมัติ, ร้านธงแดง, รายการตัดสินล่าสุด |
| GET | `/api/sales/pending-count` | จำนวนออเดอร์รอตรวจ (สำหรับ badge) — ใช้ตัวนับเดียวกับ dashboard |
| DELETE | `/api/sales/purchase-orders?poNumbers=` | ลบ PO หลายใบ · `?notify=0` ไม่แจ้งร้าน |
| GET | `/api/sales/vda-access` | VDA ที่ผู้ใช้นี้ดูแล |
| POST | `/api/sales/active-code` | สลับรหัสเซลล์ที่ใช้งานอยู่ |
| POST | `/api/sales/order-promo` | คำนวณโปรของออเดอร์แบบสด (ใช้ในหน้าตรวจ) |

> `/api/sales/daily` อยู่ในตาราง "ฝั่งร้านค้า" ด้านบน — ชื่อที่ขึ้นต้นด้วย `sales`
> เป็นชื่อเดิมที่คงไว้ แต่ผู้เรียกใช้งานจริงคือหน้าจอของร้านค้า

> `?format=view` ประกอบเอกสารจาก DB ถ้าไฟล์บนดิสก์หาย — จึงดู PO ได้เสมอแม้ volume พัง

## โปรโมชัน

| Method | Path | หน้าที่ |
|---|---|---|
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
| GET | `/api/admin/promo` · `/api/admin/promo/explain` | ตรวจโปร C4 และเหตุผลที่ SKU ได้/ไม่ได้โปร |
| GET | `/api/admin/customers/search` · `/resolve` | ค้นหา/แปลงรหัสลูกค้า |
| GET | `/api/admin/salesmen` · `/api/admin/vda-sales` · `/api/admin/badges` | ข้อมูลประกอบหน้า admin |

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
