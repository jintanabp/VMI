[← กลับหน้าแรก](./00-home.md)

# 07 — Data Model

**Prisma 6 + SQLite** (`prisma/dev.db`) เก็บเฉพาะสิ่งที่ระบบนี้สร้างเอง
ข้อมูล master (สินค้า ราคา โปร ยอดขาย) อยู่ใน Fabric ไม่ได้อยู่ใน DB นี้

## ความสัมพันธ์หลัก

```mermaid
erDiagram
    SalesRep ||--o{ Store : "ดูแล"
    Store ||--o{ Order : "สั่ง"
    Store ||--o{ StockItem : "มีสต็อก"
    Store ||--o{ StoreNotification : ""
    Store ||--o{ SalesNotification : ""
    Order ||--o{ OrderItem : ""
    Order ||--o{ PurchaseOrder : "ออก PO"
    PurchaseOrder ||--o{ OrderItem : "ผูกบรรทัด"
    Sku ||--o{ OrderItem : ""
    Sku ||--o{ StockItem : ""
```

## ตารางสำคัญ

### `Order` — ออเดอร์ที่ร้านส่ง
| ฟิลด์ | หมายเหตุ |
|---|---|
| `status` | `pending_approval` · `approved` · `rejected` |
| `createdAt` | เวลาที่ร้านกดส่ง |
| `approvedAt` | เวลาที่อนุมัติ (null เมื่อถูกปฏิเสธ) |
| `decidedAt` | เวลาที่ตัดสิน **ทั้งอนุมัติและปฏิเสธ** |
| `decidedBy` | อีเมลพนักงานที่ตัดสิน |
| `rejectReason` | เหตุผลที่ปฏิเสธ |

> `decidedAt` เพิ่มทีหลัง — เดิมการปฏิเสธไม่เขียนเวลาเลย ทำให้ timeline แสดง "รอดำเนินการ" ตลอด
> ฝั่งอ่านจึง fallback เป็น `decidedAt ?? approvedAt` เพื่อให้ข้อมูลเก่ายังถูก

### `OrderItem` — บรรทัดสินค้า พร้อมสแนปช็อต

นี่คือตารางที่สำคัญที่สุด เพราะเก็บ**หลักฐาน ณ เวลาที่ร้านกดส่ง**

| กลุ่มฟิลด์ | ฟิลด์ | ทำไมต้องแช่ |
|---|---|---|
| จำนวน | `suggestedQty` `finalQty` | เทียบได้ว่าร้าน/เซลล์แก้จากที่ระบบแนะนำไปเท่าไร |
| CVD | `cvdEstimate` `minDays` `maxDays` | ให้เซลล์เห็นสีธงตรงกับที่ร้านเห็น แม้ threshold จะถูกแก้ทีหลัง |
| ราคาร้าน | `unitPriceOverride` | ราคาที่ร้านขอ |
| ราคา C4 | `c4UnitPrice` `c4DiscountBaht` `c4DiscountPct` `c4NetUnitPrice` `c4PriceExpired` | ราคามาสเตอร์เปลี่ยนรายวัน |
| ธงราคา | `priceFlagged` `priceFlagReason` | ตัดสินฝั่ง server ตอนส่ง ไม่คำนวณใหม่ |
| ราคาเซลล์ | `salesPriceOverride` `salesPriceBy` `salesPriceAt` | แยกช่องจากของร้าน เพื่อไม่ทับหลักฐานว่าร้าน "ขอ" เท่าไร |
| **โปร** | `c4PromoLabel` `c4PromoKind` `c4PromoGroup` `c4PromoGroupMembers` `c4PooledQty` | แคมเปญเปลี่ยนตลอด |
| **ของแถม** | `c4FreeGoodCode` `c4FreeGoodName` `c4FreeGoodQty` `c4FreeGoodUnit` | ต้องพิสูจน์ได้ว่าร้านควรได้อะไร |
| PO | `poGroup` `purchaseOrderId` | บรรทัดนี้อยู่ PO ใบไหน |

> ⚠️ ออเดอร์ที่สร้างก่อน 31 ก.ค. 2569 ไม่มีข้อมูลโปร — ต้องแสดงเป็น `—` ไม่ใช่ "ไม่มีโปร"

### `PurchaseOrder` — ใบสั่งซื้อที่ออกจริง
| ฟิลด์ | หมายเหตุ |
|---|---|
| `poNumber` | unique |
| `groupKey` | `A`, `B`, … ตรงกับ `OrderItem.poGroup` |
| `priceKind` | `c4` (ตรงหมด) · `override` (ไม่ตรงหมด) · `mixed` |
| `itemCount` `totalQty` `totalAmount` | ยอดสรุป |
| `exportPath` | ที่อยู่ไฟล์ JSON หลักฐาน |
| `status` `statusAt` `statusBy` `statusNote` | สถานะติดตาม |
| `issuedBy` `issuedAt` | ใครออก เมื่อไร |

**สร้างตอนอนุมัติเท่านั้น** — ก่อนอนุมัติ การแบ่งกลุ่มอยู่ที่ `OrderItem.poGroup`
เพื่อไม่ให้มีแถว draft ค้างเมื่อเซลล์เปลี่ยนใจ

`status` เป็น `String` ไม่ใช่ enum โดยตั้งใจ — ค่าที่ใช้ได้อยู่ใน `lib/po/po-status.ts`
เปลี่ยน flow ได้โดยไม่ต้อง migrate

### `PoSequence` — running number
`bucket` = (คลัง, วัน) · `lastN` = ลำดับล่าสุด
**ต้อง mint ทีละใบ ห้ามขนาน** ไม่งั้นเลข PO ชนกัน

### แจ้งเตือน 2 ทิศทาง

| ตาราง | ทิศทาง | kind |
|---|---|---|
| `StoreNotification` | พนักงาน → ร้าน | `approved` `rejected` `deleted` `price_changed` `qty_changed` `po_issued` |
| `SalesNotification` | ร้าน → พนักงาน | `order_created` `order_cancelled` |

ทั้งคู่เก็บ**ข้อความเป็น snapshot** ไม่ผูก FK กับ `Order` เพราะออเดอร์ที่ถูกลบก็ยังต้องแจ้งให้รู้ว่าถูกลบ

`SalesNotification` ผูกกับ `storeId` ไม่ใช่ตัวเซลล์ เพราะสิทธิ์เซลล์คำนวณจาก VDA registry ตอน query
ถ้าเก็บ `salesCode` ไว้ ข้อมูลจะเพี้ยนเมื่อมีการย้ายเขต

### ตารางอื่น

| ตาราง | หน้าที่ |
|---|---|
| `Store` `Sku` `StockItem` | เงาของ master ที่ต้องอ้างอิงด้วย FK |
| `StoreAccount` | บัญชีร้านที่มี password |
| `Admin` `AllowedSalesCode` | รายชื่อผู้มีสิทธิ์ |
| `StoreGroupThreshold` | MIN/MAX ระดับกลุ่มสินค้า |
| `StoreSkuBlock` | รายการหยุดสั่ง (มี `acknowledgedAt` ให้เซลล์รับทราบ) |
| `PromoTier` | ขั้นโปรแบบเก่า ราย SKU (โปรจริงมาจาก Fabric) |

## Migrations

รันด้วย `npx prisma migrate dev` · ไฟล์อยู่ใน `prisma/migrations/`

| Migration | เพิ่มอะไร |
|---|---|
| `20260617022603_init` | โครงแรก |
| `20260708090000_store_accounts` | บัญชีร้าน |
| `20260714035025_order_item_cvd_thresholds` | แช่ MIN/MAX ลงบรรทัด |
| `20260729093651_order_item_price_override` | ราคาที่ร้านแก้ |
| `20260730040841_po_split_and_sales_price` | แบ่ง PO + ราคาเซลล์ |
| `20260730045109_store_notifications` | แจ้งเตือนร้าน |
| `20260731021725_sales_notifications` | แจ้งเตือนเซลล์ |
| `20260731031133_order_promo_snapshot_and_decided_at` | สแนปช็อตโปร/ของแถม + `decidedAt` |
| `20260731065557_po_status` | สถานะ PO |

> ทุก migration ที่เพิ่มคอลัมน์เป็น **nullable หรือมีค่า default** เสมอ — ข้อมูลเดิมไม่พัง
