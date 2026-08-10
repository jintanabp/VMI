[← กลับหน้าแรก](./00-home.md)

# 10 — ปฏิบัติการ & แก้ปัญหา

## ตรวจสุขภาพระบบ

```bash
curl -s http://127.0.0.1:3002/vmi/api/health
```

ดูเพิ่มที่ `/admin/sync` — มีสถานะรายตาราง (จำนวนแถว ขนาด อายุ error)

## ปัญหาที่เจอบ่อย

### `npm run build` แล้วบอกว่าโมดูลหาย

**สาเหตุ:** `npm run dev` ยังรันอยู่ ทั้งคู่ใช้โฟลเดอร์ `.next/` ร่วมกัน

```bash
npm run dev:stop
npm run build
```

ถ้ายังไม่หาย → `npm run clean` แล้ว build ใหม่

> นี่ไม่ใช่บั๊กจริงของโค้ด อย่าเสียเวลาไล่หาสาเหตุในไฟล์ที่ error ชี้ไป

### `Port 3000 ถูกใช้อยู่`
```bash
npm run dev:stop && npm run dev
```

### `prisma generate` ล้มด้วย EPERM (Windows)

DLL ถูกล็อกโดยโปรเซส node ที่ยังรันอยู่ — ปิดให้หมดก่อน

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### ร้านเห็นข้อมูลเก่า

1. กดปุ่ม **"ตรวจข้อมูลใหม่"** ในแอป (ล้าง cache ฝั่ง client)
2. ถ้ายังเก่า → `/admin/sync` สั่งดึงใหม่
3. เช็คว่า scheduler ทำงาน (`MASTER_REFRESH_ENABLED`)

แท็บที่เปิดค้างจะ poll `/api/data-version` ทุก 5 นาทีและล้าง cache ให้เอง

### sync ล้ม

ดู log ของ container แล้วเช็คตามลำดับ

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| auth ล้ม | service principal หมดอายุ / secret ผิด |
| ได้แถวน้อยกว่า `*_MIN_ROWS` | ต้นทางยังไม่พร้อม — ระบบไม่เขียนทับของเดิม ถือว่าถูกแล้ว |
| timeout | ไฟล์ใหญ่ / เน็ตช้า — ระบบ retry ให้เอง |

ระบบจะอีเมลไปที่ `ALERT_EMAIL` เมื่อล้มทุกครั้ง

### เซลล์ล็อกอินได้แต่ไม่เห็นออเดอร์

สิทธิ์มาจาก master ไม่ใช่ตารางใน DB — เช็คว่า

1. อีเมลอยู่ใน `cross_salesman_reference_email` ไหม
2. รหัสเซลล์นั้นผูกกับ VDA ไหม — ระบบหาจาก `cross_target_current_month` (WarehouseCode ↔ รหัสลูกค้าใน `VDA_CUSTOMER_MAP`) ดู log `[VdaAosBill] จับคู่เซลล์ให้ N VDA`
3. ถ้าถือหลายรหัส ลองกด **"ทุก VDA ของฉัน"** หรือสลับรหัสที่ active

หน้าจะขึ้นแบนเนอร์ "รหัสนี้ไม่มี VDA ที่ดูแล" ถ้าเป็นกรณีที่ 2

### ร้านส่งออเดอร์ไม่ได้

ปุ่ม "ยืนยันส่ง" จะกดไม่ได้**เฉพาะ**เมื่อไม่มีรายการที่จำนวนมากกว่า 0

> ธงแดงไม่ได้ห้ามส่ง — จะเด้งกล่องให้ยืนยันแทน
> ถ้าเจออาการปุ่มตายทั้งที่มีของ ให้แจ้ง dev พร้อมภาพหน้าจอ นี่เป็นบั๊ก

### ของแถมในรายงานดูเยอะผิดปกติ

น่าจะบวกของแถมโปรกลุ่มซ้ำ — ของแถมของโปรกลุ่มติดมาทุกบรรทัดในกลุ่ม
ต้องรวมด้วย `collectOwedFreeGoods()` เท่านั้น ดู [08 — กฎทางธุรกิจ](./08-business-rules.md)

### PO เปิดดูไม่ได้ / ขึ้น 410

ไฟล์ใน `logs/po-export/` หาย — ระบบจะประกอบเอกสารใหม่จาก DB ให้อัตโนมัติ
ถ้ายังขึ้น 410 แปลว่าข้อมูลใน DB ก็หายด้วย ให้กู้จาก backup

## Backup และกู้คืน

```bash
# backup มือ
docker compose exec vmi node scripts/backup-db.mjs

# local
npm run backup:db
```

backup อัตโนมัติเกิดทุกครั้งที่ sync สำเร็จ เก็บใน volume `vmi_backups`

**กู้คืน:** หยุด container → คัดลอกไฟล์ backup ทับ `prisma/dev.db` ใน volume `vmi_data` → start ใหม่

## สคริปต์ตรวจสอบ

| คำสั่ง | ใช้เมื่อ |
|---|---|
| `npm test` | ก่อน commit ทุกครั้ง |
| `npm run verify:sales-cover` | สงสัยว่ายอดขาย/สต็อกไม่ครบ |
| `npm run verify:promo-context` | สงสัยว่าโปรจับคู่เขตผิด |
| `npm run snapshot:promo` | เก็บ baseline ก่อนแก้โค้ดโปร |
| `npm run probe:stock-onelake` | ทดสอบการต่อ OneLake |

## เมื่อจะแก้โค้ด

1. `npm test` — เทสต์ต้องผ่านก่อนและหลัง
2. `npx tsc --noEmit`
3. หยุด dev → `npm run build`
4. `npx next lint` — ไม่ควรมี warning เพิ่ม
5. เปิดหน้าจริงดูผล ไม่ใช่แค่ build ผ่าน

งานที่ยังค้างอยู่ใน [`docs/IMPROVEMENT-PLAN.md`](../IMPROVEMENT-PLAN.md)

## ติดต่อ

- ปัญหาข้อมูล master → ทีมที่ดูแล Fabric
- ปัญหาสิทธิ์เซลล์ → ตรวจ master `cross_salesman_reference_email`, `VDA_CUSTOMER_MAP` ใน .env และไฟล์ `cross_target_current_month`
- ปัญหาระบบ → ดู log container แล้วแจ้ง dev พร้อมเวลาและอาการที่เจอ
