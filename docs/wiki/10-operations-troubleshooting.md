[← กลับหน้าแรก](./00-home.md)

# 10 — ปฏิบัติการ & แก้ปัญหา

## ตรวจสุขภาพระบบ

```bash
curl -fsSL http://127.0.0.1:3002/vmi/api/health/     # ต้องมี -L และ / ปิดท้าย (ไม่มี = 308 body ว่าง)
docker compose ps                                      # คอลัมน์ STATUS ต้องเป็น (healthy)
```

`/api/health` (`app/api/health/route.ts`) — ไม่ต้อง login · ping DB ด้วยการนับร้าน

| ฟิลด์ | ความหมาย | ถ้าผิดปกติ |
|---|---|---|
| `ok` / `database` | DB อ่านได้ | `false` + HTTP 500 = DB เปิดไม่ได้ → ดู log, ดิสก์เต็ม, ไฟล์ `/app/data/vmi.db` |
| `stores` | จำนวนร้านในระบบ | 0 บน production = DB ว่าง/ผิดไฟล์ |
| `fabric.enabled` | `DATA_SOURCE=fabric` / `USE_FABRIC_MASTERS` | `false` = ใช้ข้อมูล dummy |
| `fabric.mastersReady` · `skuMasterReady` · `promoReady` | โหลด `dim_customer` · `item_barcode_map_v2` · `cft_promotion_cash` เข้า RAM แล้ว | `false` = ไฟล์ยังไม่มี/ว่าง → ดู "sync ล้ม" |
| `fabric.onelakeConfigured` | ตั้ง workspace ไว้อย่างน้อยหนึ่งชุด | `false` = scheduler ไม่ทำงานเลย |
| `scheduler.enabled` · `lastSuccessAt` · `lastFailureAt` · `lastError` | สถานะ sync รอบล่าสุด | `lastSuccessAt` เก่ากว่า ~1 วัน = sync ค้าง |

ดูเพิ่มที่ `/admin/data/sync` — มีสถานะรายตาราง (จำนวนแถว ขนาด อายุ error ไฟล์ต้นทาง SP ที่ใช้) · เนื้อไฟล์ที่ `/admin/data/raw`

## อ่าน log

```bash
docker compose logs -f --tail=200 vmi                       # ตามดูสด
docker compose logs --since=24h vmi | grep -E "<pattern>"    # ย้อนหลัง
```

log หมุนเก็บ 5 × 10MB (compose) — **สร้าง container ใหม่ = log เก่าหาย** · อะไรที่ต้องเก็บนานให้ดูจาก audit log แทน

| pattern | มาจาก |
|---|---|
| `\[VMI\] (Unhandled\|Fatal) error` | หน้า "เกิดข้อผิดพลาด" (ค้นด้วย digest ที่ผู้ใช้ส่งมา) |
| `\[VMI refresh\]` · `\[VMI scheduler\]` | รอบ sync / ตั้งเวลา / retry / bootstrap |
| `\[VMI alert\]` | แจ้งเตือน sync ล้ม + ผลการส่งอีเมล |
| `\[VMI backup\]` | backup ตอน start และหลัง sync ประจำคืน |
| `\[OneLake\] auth` · `forbidden (40` | SP ที่ใช้จริงต่อ profile · สิทธิ์ workspace |
| `\[VdaWarehouse\]` · `\[VdaAosBill\]` · `\[CrossTarget\]` | ทะเบียนคลัง · จับคู่เซลล์ ↔ VDA · เป้าขาย |
| `\[orders:delete\]` | ลบออเดอร์ (ก่อน 29 ก.ย. 2569 เป็นหลักฐานทางเดียว) |
| `\[approve\] rollback ล้มเหลว` | ออเดอร์ค้าง approved โดยไม่มี PO — ต้องแก้มือ |
| `\[audit\] failed to record` | จด audit log ไม่สำเร็จ (งานหลักสำเร็จแล้ว) |

## ใครทำอะไร เมื่อไหร่ — บันทึกการทำงาน

«ระบบ › บันทึกการทำงาน» (`/admin/system/audit`) — **Creator เท่านั้น** (Admin เปิดไม่ได้ API ตอบ 403) · ค้นด้วยคำ (อีเมล/ร้าน/เลข PO) และกรองตามประเภท

จดเมื่อการกระทำ**สำเร็จ**แล้วเท่านั้น (ไม่จดความพยายามที่โดนปฏิเสธ) · ไม่เก็บรหัสผ่านหรือรหัสตั้งค่า · เริ่มมีข้อมูลตั้งแต่ deploy 29 ก.ย. 2569

| ประเภท (`action`) | เรื่อง |
|---|---|
| `store.approve` · `store.reject` · `store.create` · `store.delete` · `store.resetPassword` · `store.setEmail` · `store.setVda` · `store.setCanManage` | บัญชีร้านค้า |
| `admin.add` · `admin.remove` · `blocklist.add` · `blocklist.remove` | ผู้ดูแล / อีเมลที่ถูกบล็อก |
| `salesCode.assign` · `salesCode.unassign` | ผูก/ถอดอีเมลกับรหัสเซลล์ |
| `warehouses.save` · `thresholds.update` · `masters.refresh` | ทะเบียนคลัง · MIN/MAX · กดดึงข้อมูล |
| `orders.delete` | ลบออเดอร์ (เป้าหมาย = ร้าน + วันที่สั่ง + เลข PO) |
| `po.erpResolve` | บันทึกผลตรวจ "ERP ไม่ตอบ" พร้อม error เดิมและบันทึกว่าตรวจกับใคร |

มุมมองทดสอบจดชื่อคนที่กดจริง ไม่ใช่เซลล์ที่ถูกจำลอง · การอนุมัติ/แก้จำนวน/ส่ง ERP ดูจาก `decidedBy` ของออเดอร์ และ `statusBy`/`statusNote` ของ PO

## ปัญหาที่เจอบ่อย

### container ไม่เริ่มทำงาน หรือ restart ซ้ำหลัง deploy

**สาเหตุอันดับแรกคือ `NEXTAUTH_SECRET`** ระบบ production ออกแบบให้หยุดทำงานทันที
หากค่านี้ไม่ปลอดภัย เพื่อให้ตรวจพบได้เร็ว

```bash
docker compose logs vmi | grep NEXTAUTH_SECRET
# [VMI] NEXTAUTH_SECRET ... Refusing to start in production
```

ค่าที่ใช้ได้ต้อง **ไม่ว่าง · ยาวอย่างน้อย 32 ตัวอักษร · ไม่ใช่ `your-random-secret-here`
หรือ `vmi-dev-secret`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> การเปลี่ยนค่า secret จะทำให้ **ผู้ใช้ทุกคนออกจากระบบพร้อมกัน** เนื่องจาก cookie เดิม
> ตรวจสอบไม่ผ่าน กรณีนี้ไม่ใช่ความผิดปกติ ผู้ใช้สามารถเข้าสู่ระบบใหม่ได้
> หากไม่ต้องการให้เกิดเหตุการณ์นี้ ให้คงค่าเดิมไว้

### ผู้ใช้ได้รับข้อความ "พยายามบ่อยเกินไป กรุณารออีก N นาที" (429)

ระบบมีกลไกป้องกันการคาดเดารหัสผ่านและการเรียกซ้ำในความถี่สูง

| endpoint | เพดานการเรียก |
|---|---|
| `/api/auth/store/login` | 10 ครั้ง / 15 นาที ต่อ IP และอีเมล |
| `/api/auth/store/request` · `/request-reset` | 5 ครั้ง / ชั่วโมง ต่อ IP |

ตัวนับเก็บอยู่ใน**หน่วยความจำของ process** การ restart container จะรีเซ็ตค่าทันที
กรณีเร่งด่วนสามารถ restart ได้ แต่โดยปกติควรรอตามระยะเวลาที่ระบบแจ้ง

### ร้านค้าเข้าสู่ระบบไม่ได้

| ข้อความ / อาการ | สาเหตุ | การดำเนินการ |
|---|---|---|
| "รอผู้ดูแลยืนยันสิทธิ" | บัญชียังไม่ได้รับอนุมัติ | อนุมัติที่ `/admin/stores/accounts` |
| ระบบให้กำหนดรหัสผ่านทุกครั้ง | ค่า `mustSetPassword` ยังเป็น true | ให้ร้านค้ากำหนดรหัสผ่านจนครบขั้นตอน (อย่างน้อย 8 ตัวอักษร) |
| "อีเมลหรือรหัสผ่านไม่ถูกต้อง" | รหัสผ่านไม่ถูกต้อง หรือยังไม่มีบัญชี | รีเซ็ตรหัสผ่านจากหน้าผู้ดูแลระบบ |
| "ยังไม่พร้อมใช้งาน — ต้อง sync ก่อน" (503) | ยังไม่มีข้อมูล `stock_cover_day` | สั่ง sync ที่ `/admin/data/sync` |
| ได้รับสถานะ 403 เมื่อเลือก VDA | ช่องทางดังกล่าวสงวนสำหรับผู้ดูแลระบบแล้ว | ร้านค้าต้องเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน |

### ผู้ใช้พบหน้า "เกิดข้อผิดพลาด" พร้อมรหัสอ้างอิง

หน้าดังกล่าวคือ `app/error.tsx` — **ควรขอรหัสอ้างอิง (digest) จากผู้ใช้ทุกครั้ง**
แล้วนำไปค้นหาใน log

```bash
docker compose logs vmi | grep -E "\[VMI\] (Unhandled|Fatal) error"
```

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

1. กดปุ่ม **"ตรวจข้อมูลใหม่"** ในแอป (ล้าง cache ฝั่ง client · ถ้าข้อมูลกลางเก่ากว่า `MASTER_REFRESH_MAX_AGE_HOURS` จะสั่งดึงจริงด้วย)
2. ถ้ายังเก่า → `/admin/data/sync` สั่งดึงใหม่
3. เช็คว่า scheduler ทำงาน — `/api/health/` → `scheduler.enabled` และ `lastSuccessAt` · log `[VMI scheduler] Started`

แท็บที่เปิดค้างจะ poll `/api/data-version` ทุก 5 นาทีและล้าง cache ให้เอง

### โปรไม่ขึ้น / โปรผิด — เช็คเซิร์ฟเวอร์ก่อนไล่โค้ด

**อย่าเพิ่งแก้โค้ด** ถ้ายังไม่ได้พิสูจน์ว่าหน้าที่ผู้ใช้เปิดรันโค้ดชุดไหน (เคยไล่โค้ดทั้งวันแล้วพบว่าไม่มีเซิร์ฟเวอร์รันอยู่เลย)

1. **เซิร์ฟเวอร์ที่เห็นคือตัวไหน** — production: `docker compose ps` + `git rev-parse --short HEAD` เทียบ commit ที่คิดว่า deploy แล้ว ·
   เครื่อง dev: มีอะไรฟัง `:3000` ไหม และ `.next/BUILD_ID` / mtime ของ `.next` ใหม่กว่า commit ล่าสุดไหม
2. **ไฟล์โปรโหลดแล้วไหม** — `/api/health/` → `fabric.promoReady` · `/admin/data/sync` แถว `promotion_c4` (แถว อายุ error)
3. **ไฟล์ถูกใบไหม** — `/admin/promotions/c4` ขึ้นแถบแดงเมื่อคลังค้นด้วยบริบทที่ไม่มีในไฟล์ หรือไฟล์ที่โหลดไม่ใช่ตาราง cash
   (ตาราง credit เก่ามี 7-8 บริบท) · ตรวจว่า `.env` **ไม่มี** `CFT_ONELAKE_PATH` / `C4_VDA_DIVISION_MAP` / `C4_DEFAULT_*` ค้างอยู่
4. **ภาคของคลังถูกไหม** — โปรเฉพาะภาคขึ้นตามภาคของรหัสลูกค้าคลังใน `dim_customer` (ทะเบียนคลังที่ `/admin/data/warehouses`) ·
   `npm run probe:region-promos` · `npm run verify:promo-parity` เทียบหน้าร้านกับหน้าแอดมิน
5. แล้วค่อยไล่โค้ด (`lib/fabric/promotion-*.ts`, `lib/promo/`)

### sync ล้ม

```bash
docker compose logs vmi | grep "\[VMI refresh\]"
# มองหา ok=false แล้วดูชื่อ dataset:error ที่ตามหลัง
```

| error บนหน้า sync / log | สาเหตุที่พบบ่อย | ทำอะไร |
|---|---|---|
| `token: ...` | secret ของ SP หมดอายุ / ผิด | ต่ออายุ secret ใน Azure แล้วแก้ `.env` → `docker compose up -d` |
| `forbidden (403) — SP <client_id> ไม่มีสิทธิ์ workspace ...` | SP ไม่มีสิทธิ์อ่านไฟล์ใน workspace นั้น · **ถ้ามีคำว่า "STOCK_ONELAKE_* ไม่ได้ตั้ง → ใช้ SP ของ masters แทน"** = ลืมตั้ง SP ชุด stock | ตั้ง `STOCK_ONELAKE_*` ให้ครบ · หรือให้สิทธิ์ SP: Contributor หรือ Viewer + ReadAll ที่ lakehouse (Viewer เฉย ๆ อ่านไฟล์ไม่ได้) |
| `no_remote_file: ไม่พบ ...` | ต้นทางยังไม่ export ไฟล์นั้น / ย้ายที่ | ปกติสำหรับ `vdaN_product_product` บางคลัง · ชุด required = ตามทีม Fabric |
| `too_few_rows (got N, need ≥M)` | ต้นทางยังไม่พร้อม / export ไม่ครบ | ระบบไม่เขียนทับของเดิม ถือว่าถูกแล้ว — รอรอบถัดไปหรือสั่งดึงใหม่ทีหลัง |
| `validation: <คอลัมน์>` | ต้นทางเปลี่ยนชื่อ/ตัดคอลัมน์ที่เราใช้ | ตามทีม Fabric · ของเดิมในเครื่องยังใช้ต่อได้ |
| `ไม่ได้ตั้งค่า workspace ของ Fabric` | ไม่มี `ONELAKE_WORKSPACE_ID`/`LAKEHOUSE_ID` และ stock | ตั้ง `.env` |
| timeout / เน็ต | ไฟล์ใหญ่ / เน็ตช้า | รอบ scheduler retry ให้เอง (5 → 15 → 30 นาที) |

ชุดที่ไม่ required (`factsales_odoo`, `cross_target_current_month`, `assorted_mapping`, `vdaN_product_product`, `salesman_registry`)
ล้มได้โดยรอบยังนับว่าสำเร็จ — ดูรายชุดที่หน้า sync ไม่ใช่แค่ป้ายรวม

**สถานะระบบระหว่างที่ sync ยังไม่สำเร็จ**

- ระบบ **ยังคงใช้งานได้** ด้วยข้อมูลชุดเดิม ไม่หยุดให้บริการ
- ร้านค้าจะเห็นข้อความ "ข้อมูล ณ" เปลี่ยนเป็น **สีเหลืองหรือสีแดง** เพื่อแจ้งว่ากำลังดูข้อมูลเดิม
- **การสำรองฐานข้อมูลยังทำงานตามปกติ** ไม่ถูกข้ามเหมือนพฤติกรรมเดิม
- หากไม่สำเร็จติดต่อกันเกิน 2 คืน ควรประสานทีมที่ดูแล Fabric โดยเร็ว
  เนื่องจากค่า CVD จะคลาดเคลื่อนจากความเป็นจริงมากขึ้นตามลำดับ

**กรณีไม่ได้รับอีเมลแจ้งเตือน** ต้องกำหนด `SENDER_EMAIL` (mailbox ที่มีสิทธิ์ Graph `Mail.Send`) — ผู้รับคือ `ALERT_EMAIL`
(ไม่ตั้ง = ส่งถึง `SENDER_EMAIL` เอง) · ขาด `SENDER_EMAIL` ระบบข้ามการส่งเงียบ ๆ เหลือแค่ log
`[VMI alert] Email skipped` · token ของ Graph ใช้ SP ชุด masters (`ONELAKE_*`) · อีเมลออกหลังรอบ scheduler retry ครบแล้ว
(ประมาณ 50 นาที) — ปุ่ม sync ที่คนกดไม่ส่งอีเมล

### ส่ง PO เข้า ERP ไม่สำเร็จ

> ⚠️ **อย่ากดส่งซ้ำเพื่อ "ลองดู"** — ส่งซ้ำเลขเดิมที่อาจเข้าไปแล้ว = คู่เลขซ้ำ เลข PO ถูกล็อก 6 เดือน ·
> ปลายทางตอนนี้คือ UAT (`lib/po/erp-endpoint.ts`) · ระบบไม่มี auto-retry โดยตั้งใจ

ดูผลที่รายละเอียด PO (กล่องสถานะ ERP) — ข้อความ error ดิบเก็บใน `PurchaseOrder.erpError`

| สิ่งที่เห็น | ความหมาย | ทำอะไร |
|---|---|---|
| ปุ่มส่งปิด พร้อมเหตุผล (ไม่มีวันรับของ / VAT ไม่รู้ / ราคา 0 / จำนวน 0 / ไม่มีรหัสเซลล์ ...) — HTTP 409 | ใบยังไม่พร้อม **ไม่ได้ยิงอะไรออกไป** สถานะยังเป็น "ออกแล้ว" | แก้ตามเหตุผล: รหัสลูกค้า → `/admin/data/warehouses` · รหัสเซลล์ → ทะเบียน VDA (cross_target) · VAT ไม่รู้ → master ยังไม่โหลดหรือสินค้าไม่มี `VatStatus` |
| 503 "ปิดการส่งเข้า ERP บนเครื่องนี้ไว้ (ERP_SEND_DISABLED=1)" | ตั้ง `ERP_SEND_DISABLED=1` อยู่ | ตั้งใจหรือไม่ — ถอดค่าแล้ว restart ถ้าได้รับอนุญาตให้ส่ง |
| "ERP ปฏิเสธ" (สถานะกลับเป็น "ออกแล้ว") | ERP ตอบ `success:false` ชัดเจน — เลขนั้นใช้ไม่ได้อีก | แก้สาเหตุตามข้อความ แล้วกด «ขอเลขใหม่แล้วลองส่งอีกครั้ง» (ได้เลขใหม่ของวันนี้ เนื้อในเดิม) |
| สถานะ **«ERP ไม่ตอบ — รอตรวจ»** (`erp_unknown`) | timeout 15 วิ / เน็ตหลุด / HTTP error — **อาจเข้า ERP ไปแล้วก็ได้** · ส่งซ้ำ ขอเลขใหม่ ลบ ยกเลิก ถูกล็อกหมด | ทำตามขั้นตอนด้านล่าง |
| "กำลังส่ง ERP" ค้างนาน | request ถูกตัดกลางคัน (container restart ระหว่างยิง) | **อย่าเปลี่ยนสถานะเอง** ตรวจกับทีม ERP ก่อน แล้วแจ้ง dev (ต้องแก้ใน DB) |
| สำเร็จแต่เตือนจำนวนบรรทัดไม่ตรง | `insertedRows` ≠ บรรทัดที่ส่ง | ตรวจกับทีม ERP ว่าเข้าครบไหม |

**ปิดเรื่อง "ERP ไม่ตอบ — รอตรวจ"**

1. แจ้งทีม ERP ให้ตรวจว่ามี `orderNo` = เลข PO นี้ (คู่กับรหัสลูกค้าของคลัง) ในระบบไหม
2. เปิดรายละเอียด PO → กล่องแดง «ตรวจกับทีม ERP แล้ว?» → เลือก
   - **«มีใบนี้ใน ERP แล้ว»** → ใบเป็น «เข้า ERP แล้ว» ร้านได้แจ้งเตือน ส่งซ้ำไม่ได้อีก
   - **«ไม่มีใน ERP — ส่งใหม่ได้»** → ใบกลับเป็น "ออกแล้ว" แล้วกดส่งใหม่ได้**ด้วยเลขเดิม**
     (ถ้าที่จริงเข้าไปแล้ว ERP จะตีกลับว่าเลขซ้ำ ไม่เกิดออเดอร์ซ้อน — จึงปลอดภัยกว่าขอเลขใหม่)
3. กรอก «ตรวจกับใคร / เมื่อไหร่» (อย่างน้อย 3 ตัวอักษร) → «บันทึกผลการตรวจ» · จดลงบันทึกการทำงาน (`po.erpResolve`) พร้อม error เดิม

ใช้ได้กับเซลล์ที่ดูแลออเดอร์นั้นและ Creator (มุมมองทดสอบกดไม่ได้) · ขึ้น "ใบนี้ถูกแก้ไประหว่างทาง" = มีคนทำไปก่อน ให้รีเฟรช ·
PO เก่าก่อน 29 ก.ย. 2569 ที่ผลไม่ชัดเจนยังขึ้น "ออกแล้ว" แต่กล่องแดงและปุ่มเดียวกันใช้ได้

### ร้านตั้งรหัสผ่านครั้งแรกไม่ได้ ("รหัสตั้งค่าไม่ถูกต้องหรือหมดอายุ")

รหัสตั้งค่า (8 ตัว) ใช้ได้ครั้งเดียว ภายใน 72 ชม. และใช้ได้เฉพาะรหัสล่าสุด — ให้แอดมินกด «ออกรหัสตั้งค่าใหม่» ในหน้าบัญชีร้านค้า
(`/admin/stores/accounts`) แล้วส่งรหัสใหม่ให้ร้าน · รหัสโชว์ครั้งเดียวตอนออก ระบบเก็บแค่ hash (ดูย้อนหลังไม่ได้ ต้องออกใหม่) ·
ลองผิดเกิน 5 ครั้ง/15 นาที ต่ออีเมล จะถูกพักชั่วคราว (429)
· login ร้านไม่ต้องรอ Fabric แล้ว — sync ล้มร้านยังเข้าระบบได้ แค่หน้าสต็อกว่าง

### เซลล์เข้าสู่ระบบไม่ได้ ("อีเมลนี้ยังไม่ได้ผูกกับรหัสเซลล์ ...")

อีเมลนั้นยังไม่ได้ผูกกับรหัสเซลล์ใดเลย — เพิ่มอีเมลให้รหัสที่ `/admin/system/vda-sales` «สิทธิ์เซลล์-VDA»
(Creator หรือ Admin ที่มีสิทธิ์ `salesCodes` · มีผลทันที ไม่ต้องรอ sync) · ไม่ใช้ไฟล์ `cross_salesman` แล้ว ·
อีเมลใน `ADMIN_EMAILS` (Creator) เข้าได้เสมอโดยไม่ต้องผูก — ใช้บัญชีนี้ผูกให้คนอื่น · การผูก/ถอดจดลงบันทึกการทำงาน

### เอาอีเมลออกจากรหัสเซลล์แล้ว ผู้ใช้ยังเห็นออเดอร์อยู่

ไม่ควรเกิดแล้ว — สิทธิ์คำนวณใหม่ทุก request เมื่อการกำหนดเปลี่ยน (`revalidateManualCodes`) ·
ถ้ายังเห็น ให้ตรวจว่าแถวใน `SalesmanEmailAssignment` ถูกลบ/`active=false` จริง และอีเมลนั้นไม่ได้ผูกกับรหัสอื่นที่ดูแล VDA เดียวกัน

### เซลล์ล็อกอินได้แต่ไม่เห็นออเดอร์

สิทธิ์ = รหัสที่ผูกกับอีเมล (`SalesmanEmailAssignment`) → VDA (ทะเบียน VDA) — เช็คว่า

1. อีเมลผูกกับรหัสที่ถูกต้องไหม (`/admin/system/vda-sales`)
2. รหัสเซลล์นั้นผูกกับ VDA ไหม · **ทะเบียน VDA ไม่โหลด = เซลล์ไม่เห็นออเดอร์เลย** (ปิดไว้ก่อนตั้งใจ ไม่ถอยไปใช้ข้อมูลเก่า) —
   ระบบหาจาก `cross_target_current_month` (`WarehouseCode` ↔ รหัสลูกค้าของคลังในทะเบียน `/admin/data/warehouses`)
   ดู log `[VdaWarehouse]` / `[VdaAosBill] รหัสลูกค้าของ N คลัง` และ `[VdaAosBill] จับคู่เซลล์ให้ N VDA` ·
   `cross_target` ไม่ required — ดึงไม่ได้ sync ยังขึ้นเขียว ต้องดูแถวของมันที่ `/admin/data/sync` เอง
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

### ช่วงเวลาที่ระบบสำรองข้อมูล

| ช่วงเวลา | หมายเหตุ |
|---|---|
| ทุกรอบ sync ประจำคืน | ดำเนินการ**ไม่ว่า sync จะสำเร็จหรือไม่** เนื่องจากวันที่ sync ล้มเหลวคือวันที่ควรมีสำเนาข้อมูลมากที่สุด |
| ทุกครั้งที่ container เริ่มทำงาน | ดำเนินการ**ก่อน** `prisma migrate deploy` (`VMI_BACKUP_ON_START` — compose ฮาร์ดโค้ด `true` ปิดได้โดยแก้ compose เท่านั้น) · backup ล้มไม่หยุดการ start ดู log `[VMI backup]` |

ไฟล์จัดเก็บใน volume `vmi_backups` โดยมี path ภายใน container คือ
`/app/backups/vmi-<ISO timestamp>.db` เก็บย้อนหลังตามค่า `BACKUP_KEEP` (ค่าเริ่มต้น 14 ไฟล์)
ส่วนที่เกินระบบจะลบให้อัตโนมัติ

ไฟล์สำรองสร้างด้วยคำสั่ง `VACUUM INTO` จึงเป็นไฟล์เดียวที่สมบูรณ์ในตัว
**ไม่จำเป็นต้องใช้ไฟล์ `-wal` หรือ `-shm` ประกอบ**

### การกู้คืนข้อมูล

> ⚠️ ฐานข้อมูลภายใน container อยู่ที่ **`/app/data/vmi.db`** ไม่ใช่ `prisma/dev.db`
> (`prisma/dev.db` เป็น path สำหรับการพัฒนาบนเครื่องเท่านั้น)

```bash
# 1. ดูว่ามีไฟล์ backup อะไรบ้าง (ชื่อไฟล์เป็นเวลา UTC — vmi-2026-09-29T02-15-00-000Z.db)
docker compose exec vmi ls -lh /app/backups

# 2. สำรองสภาพปัจจุบันไว้ก่อน (เผื่อเลือกไฟล์ผิด) แล้วหยุดแอป
docker compose exec vmi node scripts/backup-db.mjs
docker compose stop vmi

# 3. เขียนทับฐานข้อมูลด้วยไฟล์ที่เลือก + ลบไฟล์ journal ค้าง (ถ้ามี)
docker compose run --rm --entrypoint sh vmi -c \
  "cp /app/backups/vmi-<timestamp>.db /app/data/vmi.db && rm -f /app/data/vmi.db-wal /app/data/vmi.db-shm /app/data/vmi.db-journal"

# 4. เปิดใหม่แล้วตรวจ (entrypoint จะ backup อีกรอบแล้ว migrate deploy ให้ไฟล์เก่าตาม schema ปัจจุบัน)
docker compose start vmi
curl -fsSL http://127.0.0.1:3002/vmi/api/health/
```

หลังกู้:

- ข้อมูลหลังเวลาของไฟล์ backup **หาย** (ออเดอร์ การอนุมัติ PO บันทึกการทำงาน) — แจ้งผู้ใช้
- ⚠️ PO ที่ส่ง ERP หลังเวลานั้นหายจากฝั่งเราแต่ ERP ยังมี — ก่อนกู้ให้จดเลข PO ที่ `erpSentAt`/`erpError` อยู่ในช่วงนั้นไว้
  (ห้ามให้ใครส่งเลขเดิมซ้ำ) · ไฟล์เอกสารใน `vmi_logs/po-export/` ไม่ถูกย้อนตาม
- ถ้าไฟล์ backup เก่ากว่า migration ล่าสุด `migrate deploy` จะรัน migration ให้ใหม่ตอน start (ไม่ต้องทำอะไรเพิ่ม)
- ทดสอบบนเครื่อง dev ได้โดยชี้ `DATABASE_URL` ไปที่สำเนาของไฟล์ backup แล้ว `npm run build && npm run start`

**ควรทดสอบขั้นตอนการกู้คืนอย่างน้อย 1 ครั้งก่อนเปิดใช้งานจริง** เนื่องจากขั้นตอนที่ยังไม่เคย
ทดสอบไม่อาจถือว่าใช้งานได้จริง

## สคริปต์ตรวจสอบ

| คำสั่ง | ใช้เมื่อ |
|---|---|
| `npm test` | ก่อน commit ทุกครั้ง |
| `npm run verify:sales-cover` | สงสัยว่ายอดขาย/สต็อกไม่ครบ |
| `npm run verify:promo-context` | สงสัยว่าโปรจับคู่เขตผิด |
| `npm run snapshot:promo` | เก็บ baseline ก่อนแก้โค้ดโปร |
| `npm run probe:stock-onelake` | ทดสอบการต่อ OneLake |
| `npm run probe:promo-cash` | พิสูจน์ว่า SP ไหนอ่านตาราง C4 ที่ Bronze ได้ (อ่านอย่างเดียว) |
| `npm run verify:promo-parity` | โปรหน้าร้านไม่ตรงกับหน้าแอดมิน |

## เมื่อจะแก้โค้ด

1. `npm test` — เทสต์ต้องผ่านก่อนและหลัง
2. `npx tsc --noEmit`
3. หยุด dev → `npm run build`
4. `npx next lint` — ไม่ควรมี warning เพิ่ม
5. เปิดหน้าจริงดูผล ไม่ใช่แค่ build ผ่าน

งานที่ยังค้างอยู่ใน [`docs/IMPROVEMENT-PLAN.md`](../IMPROVEMENT-PLAN.md)

## ติดต่อ

- ปัญหาข้อมูล master → ทีมที่ดูแล Fabric (แนบข้อความ error จาก `/admin/data/sync` ซึ่งบอก SP + workspace + ไฟล์)
- ปัญหาสิทธิ์เซลล์ → ตรวจอีเมลที่ผูกไว้ในหน้า «สิทธิ์เซลล์-VDA», ทะเบียนคลัง VDA และไฟล์ `cross_target_current_month`
- PO ที่ส่ง ERP แล้วไม่รู้ผล → ทีม ERP (ให้เลข PO + รหัสลูกค้าของคลัง) แล้วบันทึกผลในรายละเอียด PO
- ปัญหาระบบ → ดู log container แล้วแจ้ง dev พร้อมเวลา อาการ และรหัสอ้างอิง (digest) ถ้ามี
