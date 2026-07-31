[← กลับหน้าแรก](./00-home.md)

# 06 — Fabric / OneLake

ข้อมูล master ทั้งหมดมาจาก Microsoft Fabric แบบ **อ่านอย่างเดียว** ระบบไม่เคยเขียนกลับ

## ไฟล์ที่ดึงมา

| ไฟล์ใน `data/cache/` | เนื้อหา | ใช้ทำอะไร |
|---|---|---|
| `item_barcode_map_v2.csv` | มาสเตอร์สินค้า + ราคา (ไฟล์ใหญ่สุด ~68MB) | ชื่อ บาร์โค้ด ขนาดหีบ ราคา |
| `stock_cover_day.csv` | สต็อกคงเหลือ | คำนวณ CVD |
| `factsales_odoo.csv` | ยอดขายรายวัน | ขายเฉลี่ย/วัน, กราฟ |
| `cross_sold_history_2y_qu.csv` | ยอดขายย้อนหลัง 2 ปี | สำรอง |
| `cft_promotion_cash.csv` | โปรโมชัน C4 (เงินสด) | ขั้นโปร ส่วนลด ของแถม |
| `cft_promotion_credit.csv` | โปรโมชัน C4 (เครดิต) | สำรอง/rollback |
| `cross_salesman_reference_email.csv` | ทะเบียนพนักงานขาย | บทบาท ลูกทีม สิทธิ์ |
| `dim_customer.csv` | ทะเบียนลูกค้า/ร้าน | ชื่อร้าน เขต |

## วงจรการโหลด

```mermaid
flowchart LR
    OneLake[("OneLake")] -->|sync| CSV["data/cache/*.csv"]
    CSV -->|boot: warmFabricMasters| RAM["registries ใน RAM"]
    RAM -->|ensureFabricMastersFresh| Req["request"]
    CSV -.->|mtime เปลี่ยน| RAM
```

1. **ตอน boot** `instrumentation.ts` เรียก `warmFabricMasters()` โหลดทุกไฟล์เข้า RAM
2. **ทุก request** `ensureFabricMastersFresh()` เช็ค mtime ของไฟล์ ถ้าไม่เปลี่ยนก็ใช้ของใน RAM เลย
3. **ถ้าไฟล์ใหม่กว่า** จึง parse ใหม่เฉพาะไฟล์นั้น

> ถ้าไม่ preload ตอน boot ผู้ใช้คนแรกจะต้องรอ parse ไฟล์ 68MB บน request thread
> (วัดได้ 2,852ms → หลัง preload เหลือ 0ms)

## การ sync

### สั่งเอง
```bash
npm run sync:masters
```

### อัตโนมัติ
`lib/fabric/scheduler.ts` ตั้งเวลารายวันตามโซน **Asia/Bangkok**

| env | ค่าเริ่มต้น |
|---|---|
| `MASTER_REFRESH_ENABLED` | เปิด/ปิด scheduler |
| `MASTER_REFRESH_HOUR` | `3` |
| `MASTER_REFRESH_MINUTE` | `30` |
| `ALERT_EMAIL` | อีเมลรับแจ้งเมื่อ sync ล้ม |

### ผ่านหน้าเว็บ
`/admin/sync` → กดดึงข้อมูล และดูสถานะรอบล่าสุด

## กลไกกันข้อมูลพัง

| กลไก | ทำอะไร |
|---|---|
| `*_MIN_ROWS` | ถ้าไฟล์ที่ดึงมามีแถวน้อยกว่าที่กำหนด = ถือว่าดึงพลาด ไม่เขียนทับของเดิม |
| backup | เก็บไฟล์เดิมไว้ก่อนเขียนทับ |
| retry | ลองใหม่เมื่อ OneLake ตอบพลาดชั่วคราว |
| streaming parse | อ่านไฟล์ใหญ่แบบ stream ไม่โหลดทั้งก้อนเข้า RAM |

## เรื่องวันที่ที่ต้องระวัง

- **โซนเวลา** ใช้ `lib/fabric/bkk-date.ts` เทียบวันที่แบบ Asia/Bangkok เสมอ
  เคยมีบั๊กที่โปรวันสุดท้ายดับกลางเช้าเพราะเทียบ UTC
- **ยอดขายเก็บ 120 วัน** (`MAX_DAYS_KEPT` ใน `sold-history.ts`) นับถอยหลังจาก**วันล่าสุดในไฟล์**
  ไม่ใช่จากวันนี้ — เผื่อไว้ให้ query 90 วันไม่หลุด cutoff แม้ไฟล์จะช้าไปสองสามวัน
- **วันสุดท้ายของ series** คือวันล่าสุดในไฟล์ ไม่ใช่วันนี้ (กันข้อมูลที่มาช้า)

## env ที่เกี่ยวข้อง

```bash
DATA_SOURCE=fabric          # dummy = ใช้ seed, fabric = ใช้ OneLake
USE_FABRIC_MASTERS=1
ONELAKE_TENANT_ID= ONELAKE_CLIENT_ID= ONELAKE_CLIENT_SECRET=
ONELAKE_WORKSPACE_ID= ONELAKE_LAKEHOUSE_ID= ONELAKE_SCAN_DIR=
STOCK_ONELAKE_*             # ชุดแยกสำหรับสต็อก
CFT_*                       # ชุดแยกสำหรับโปรโมชัน
VDA_AOS_*                   # ทะเบียน VDA ↔ พนักงานขาย
SKU_MIN_ROWS= SOLD_HISTORY_MIN_ROWS= ...   # เกณฑ์กันไฟล์พัง
```

## สคริปต์ตรวจสอบ

| คำสั่ง | ตรวจอะไร |
|---|---|
| `npm run verify:sales-cover` | ยอดขายกับสต็อกครบทุก SKU ไหม |
| `npm run verify:promo-context` | โปรถูกจับคู่กับเขต/กลุ่มลูกค้าถูกต้องไหม |
| `npm run snapshot:promo` | เก็บ baseline โปรไว้เทียบก่อน/หลังเปลี่ยนโค้ด |
| `npm run probe:stock-onelake` | ทดสอบการเชื่อมต่อ OneLake |
| `npm run probe:promo-cash` | ดูข้อมูลโปรดิบ |

## โหมด dummy

ตั้ง `DATA_SOURCE=dummy` แล้ว `npm run db:setup` จะ seed ข้อมูลจำลอง
พัฒนา UI ได้โดยไม่ต้องต่อ Azure
