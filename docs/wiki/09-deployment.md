[← กลับหน้าแรก](./00-home.md)

# 09 — Production Deploy

Deploy ด้วย Docker Compose หลัง nginx ที่ path `/vmi/` · ไฟล์ที่เกี่ยวข้อง: `docker-compose.yml`, `docker/Dockerfile`,
`docker/entrypoint.sh`, `.dockerignore`, `.env.example`, `scripts/backup-db.mjs`

## 1. เตรียม `.env`

```bash
cp .env.example .env
```

ค่าที่ต้องใส่จริง (ที่เหลือใน `.env.example` เป็น override ทั้งหมด — ค่าที่ถูกอยู่ในโค้ดแล้ว)

```bash
NEXTAUTH_SECRET=            # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
                            # !! ต้อง >= 32 ตัว และไม่ใช่ your-random-secret-here / vmi-dev-secret
                            #    มิฉะนั้น container จะไม่เริ่มทำงาน (ออกแบบให้หยุดทันที)
ADMIN_EMAILS=               # Creator (สิทธิ์เต็ม) คั่นด้วย , หรือ ; — Admin จำกัดสิทธิ์เพิ่มในแอปที่ «ระบบ › ผู้ดูแล»
ALERT_EMAIL=                # ผู้รับแจ้งเมื่อ sync ล้ม (ไม่ตั้ง = ส่งถึง SENDER_EMAIL)
SENDER_EMAIL=               # mailbox ผู้ส่ง (Graph Mail.Send) — ขาดตัวนี้ = ไม่มีอีเมลออกเลย
DATA_SOURCE=fabric

ONELAKE_TENANT_ID= ONELAKE_CLIENT_ID= ONELAKE_CLIENT_SECRET=          # SP masters
ONELAKE_WORKSPACE_ID= ONELAKE_LAKEHOUSE_ID=
STOCK_ONELAKE_TENANT_ID= STOCK_ONELAKE_CLIENT_ID= STOCK_ONELAKE_CLIENT_SECRET=   # SP stock (อ่าน Bronze/C4 ด้วย)
STOCK_ONELAKE_WORKSPACE_ID= STOCK_ONELAKE_LAKEHOUSE_ID=
VDA_CUSTOMER_MAP=           # seed ทะเบียนคลังครั้งแรกเท่านั้น (ตาราง VdaWarehouse ว่าง) — หลังจากนั้นแก้ที่ /admin/data/warehouses
```

ไม่ต้องตั้ง (มีค่าในโค้ดแล้ว): `CFT_*`, `CROSS_TARGET_*`, `*_ONELAKE_PATH`, `*_MIN_ROWS`, `C4_*`, `VDA_CODES` —
**ค่าใน .env ชนะโค้ดเสมอและเงียบเวลาตั้งผิด** ดู [06 — Fabric](./06-fabric-integration.md#env-ที่เกี่ยวข้อง)

ตัวแปรที่เกี่ยวกับการปฏิบัติการ

| env | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| `ERP_SEND_DISABLED` | ไม่ตั้ง | `1` = ปิดการส่ง PO เข้า ERP (ปิดได้อย่างเดียว เปิดต้องแก้ `SEND_ENABLED` ในโค้ด) · โค้ดตอนนี้เปิดและชี้ **UAT** เท่านั้น |
| `BACKUP_KEEP` | `14` | จำนวนไฟล์ backup ที่เก็บ |
| `MASTER_REFRESH_HOUR` / `_MINUTE` / `_MAX_AGE_HOURS` | `3` / `30` / `20` | ดู 06 |
| `DEV_LOGIN` | — | **ห้ามตั้งบน server** (`/api/dev/login` ปิดเองใน production อยู่แล้ว) |

> ⚠️ **ค่าที่ `docker-compose.yml` ฮาร์ดโค้ดไว้ใน `environment:` ชนะ `.env` เสมอ** (`environment:` > `env_file:`):
> `NODE_ENV=production` · `DATABASE_URL=file:/app/data/vmi.db` · `FABRIC_CACHE_DIR=/app/data/cache` · `BACKUP_DIR=/app/backups` ·
> **`MASTER_REFRESH_ENABLED="true"`** · **`VMI_BACKUP_ON_START="true"`** —
> ตั้งสองตัวหลังใน `.env` เป็น `false` **ไม่มีผล** ต้องแก้ใน compose แล้ว `docker compose up -d`

> ⚠️ **`NEXT_PUBLIC_*` ตั้งใน `.env` บน server ไม่ได้ — ตั้งไปก็ไม่มีผล**
> ค่าพวกนี้ถูกฝังลง JS ตอน `next build` ไม่ได้อ่านตอนรัน และ `.dockerignore`
> กัน `.env` ออกจาก build context อยู่แล้ว → builder stage ไม่เคยเห็นไฟล์นั้น
> ส่วน `env_file:` ใน docker-compose มีผลกับ process ตอนรันเท่านั้น
>
> client id / tenant id ของ Azure จึงย้ายไปอยู่ในโค้ดที่ `lib/auth/azure-app.ts`
> (เป็นตัวระบุสาธารณะ ไม่ใช่ความลับ) ไม่ต้องตั้งอะไรเพิ่ม · `NEXT_PUBLIC_AZURE_REDIRECT_URI`
> ก็ไม่ต้องตั้ง ระบบใช้ `window.location.origin + /vmi/auth/callback` เอง
>
> ถ้าจำเป็นต้องเปลี่ยนจริง ๆ ให้แก้ในโค้ดแล้ว build ใหม่ — ห้ามหวังพึ่ง env บน server

## 2. Build และรัน

```bash
docker compose up -d --build
docker compose ps                                        # ต้องขึ้น (healthy) ภายใน ~1-2 นาที
curl -fsSL http://127.0.0.1:3002/vmi/api/health/         # ต้องมี -L และ / ปิดท้าย
```

> `trailingSlash: true` ทำให้ `/vmi/api/health` (ไม่มี `/`) ตอบ **308** — `curl -s` เฉย ๆ ได้ body ว่าง
> และ `curl -f` ถือว่าผ่านโดยไม่เคยแตะ handler · healthcheck ของ compose/Dockerfile ใช้ `-fsSL .../health/` ด้วยเหตุผลนี้

| รายการ | ค่า |
|---|---|
| Host port | **3002** (bind `127.0.0.1` เท่านั้น — เข้าได้ผ่าน nginx เท่านั้น) |
| Container port | 3000 |
| Container / project name | `vmi` |
| Base image | `node:20-bookworm-slim` (3 stage: deps → builder → runner) · รันด้วย user `nextjs` (uid 1001) |
| Healthcheck | `curl -fsSL http://localhost:3000/vmi/api/health/` ทุก 30 วิ · start period 60 วิ |
| Log | json-file `max-size 10m` × `max-file 5` |
| Restart | `unless-stopped` |

### ลำดับตอน container start (`docker/entrypoint.sh`)

1. สร้างโฟลเดอร์ `/app/data/cache`, `/app/data/logs`, `/app/backups`, `/app/logs/po-export`
2. **backup ฐานข้อมูล** (`node scripts/backup-db.mjs` · ปิดได้ด้วย `VMI_BACKUP_ON_START=false` — แก้ใน compose)
3. `npx prisma migrate deploy`
4. `exec npx next start -p 3000` → `instrumentation.ts` (ตรวจ secret · bootstrap admin · ทะเบียนคลัง · scheduler · preload master · catch-up)

> backup ต้องมา**ก่อน** migrate — migration ที่ลบ/เปลี่ยนคอลัมน์ย้อนกลับไม่ได้
> หากสำรองหลัง migrate สำเนาที่ได้จะเป็นข้อมูลหลังการเปลี่ยนแปลงไปแล้ว
>
> ⚠️ backup ล้มจะ**ไม่หยุด** การ start (`|| true`) — ดู log ว่ามี `[VMI backup] Saved (vacuum) ...` ทุกครั้งที่ deploy ·
> boot ครั้งแรกที่ยังไม่มีไฟล์ DB จะขึ้น `ไม่มีไฟล์ฐานข้อมูลให้สำรอง` (ปกติ)

container ใหม่ที่ยังไม่มี CSV จะดึงไฟล์ที่ขาดจาก OneLake เองตอน boot (`bootstrapMissingMasters`) ไม่ต้องสั่ง sync เอง ·
ระหว่างนั้น (ไฟล์ SKU ~68MB) ร้าน login ได้ แต่หน้าสต็อกอาจตอบ "ยังไม่พร้อมใช้งาน — ต้อง sync ก่อน" (503)

### Volumes

| Volume | mount | เก็บอะไร |
|---|---|---|
| `vmi_data` | `/app/data` | SQLite (`vmi.db`) · Fabric CSV cache (`cache/`) · สถานะ sync (`logs/master-refresh-status.json`) |
| `vmi_backups` | `/app/backups` | backup DB (`vmi-<ISO timestamp>.db`) |
| `vmi_logs` | `/app/logs` | ไฟล์เอกสาร PO (`po-export/`) |

> `vmi_logs` ไม่ใช่แค่ log — มีไฟล์ PO ที่เป็นหลักฐานอยู่ **ห้ามลบทิ้ง**
> (ถ้าหายจริง ระบบยังประกอบเอกสารจาก DB ให้ได้ แต่จะเสียหลักฐานต้นฉบับ)
>
> **ห้าม `docker compose down -v`** — `-v` ลบ volume ทั้งสามรวมถึงฐานข้อมูลและ backup

`.dockerignore` กัน `data/`, `backups/`, `logs/`, `prisma/dev.db*`, `.env*` (ยกเว้น `.env.example`), `docs/`, `tests/`, `notebooks/`
ออกจาก build context — image ไม่มีข้อมูลหรือความลับติดไป

## 3. nginx

Next.js ตั้ง `basePath: '/vmi'` ไว้แล้ว — **ห้ามตัด prefix ออกใน `proxy_pass`** · repo ไม่มีไฟล์ config ของ nginx (อยู่บน server)

```nginx
location /vmi/ {
    proxy_pass         http://127.0.0.1:3002;  # ไม่มี / ท้าย
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    client_max_body_size 50M;
    proxy_read_timeout   120s;
    proxy_send_timeout   120s;
}

location = /vmi {
    return 301 /vmi/;
}
```

> ใส่ `/` ท้าย `proxy_pass` เมื่อไหร่ prefix `/vmi` จะถูกตัด แล้วทุก asset จะ 404

- `client_max_body_size 50M` เผื่อ Excel export ใบใหญ่ · timeout 120s เผื่อ sync ที่ใช้เวลานาน
- **`X-Real-IP` ต้องตั้งจาก `$remote_addr`** — rate limit (`lib/auth/rate-limit.ts`) เชื่อค่านี้ก่อน แล้วค่อย hop **สุดท้าย** ของ `X-Forwarded-For`
  (ไม่ใช่ hop แรกที่ client ปลอมได้) · แอปถูกเรียกตรงโดยไม่ผ่าน nginx = rate limit นับผิดคน

## 4. Azure Portal

เพิ่ม Redirect URI (ประเภท **SPA**) ใน App Registration ที่ `lib/auth/azure-app.ts` ชี้อยู่

```
https://spc-ai.sahapat.com/vmi/auth/callback
```

## 5. อัปเดตเวอร์ชันใหม่ (ขั้นตอนมาตรฐาน)

```bash
# 0. จดเวอร์ชันที่รันอยู่ไว้ใช้ rollback
cd /path/to/VMI
git rev-parse --short HEAD

# 1. อ่านบันทึกรุ่นด้านล่าง: มี migration ไหม · ต้องแก้ .env ไหม · ต้องทำอะไรหลังขึ้น
git fetch && git log --oneline HEAD..origin/main
git diff --stat HEAD..origin/main -- prisma/migrations .env.example docker-compose.yml

# 2. backup มือเพิ่มอีกชุด (entrypoint จะ backup ให้อีกครั้งก่อน migrate)
docker compose exec vmi node scripts/backup-db.mjs

# 3. ดึงโค้ดแล้ว build + restart
git pull
docker compose up -d --build

# 4. ตรวจ
docker compose logs --tail=100 vmi | grep -E "\[VMI\]|backup|migrat|Error"
curl -fsSL http://127.0.0.1:3002/vmi/api/health/
```

หลังขึ้น ตรวจ:

- [ ] log มี `[VMI backup] Saved` → `Running database migrations...` → `All migrations have been successfully applied` (หรือ `No pending migrations`) → `Starting Next.js`
- [ ] `/vmi/api/health/` ได้ `"ok":true` · `fabric.mastersReady` / `promoReady` / `skuMasterReady` = true · `scheduler.enabled` = true
- [ ] `docker compose ps` ขึ้น `healthy`
- [ ] login ได้ทั้งร้านและเซลล์ · เปิด `/admin/data/sync` เห็นทุกชุดข้อมูล · `/admin/promotions/c4` ไม่มีแถบแดง
- [ ] ทำ checklist เฉพาะรุ่น (ด้านล่าง)

migration รันเองตอน start — และมี backup ให้ก่อนแล้วอัตโนมัติ · ห้ามรัน `prisma db push` กับฐานจริง

## 6. Rollback

**กรณีรุ่นใหม่ไม่มี migration** — ย้อนโค้ดอย่างเดียวพอ ข้อมูลไม่ต้องแตะ

```bash
git checkout <commit เดิม>          # หรือ git reset --hard <commit เดิม> บน branch deploy
docker compose up -d --build
curl -fsSL http://127.0.0.1:3002/vmi/api/health/
```

**กรณีรุ่นใหม่มี migration** — Prisma ไม่มี down migration · โค้ดเก่ากับ schema ใหม่อาจเข้ากันไม่ได้

1. ถ้า migration **เพิ่มตาราง/คอลัมน์ล้วน** (เช่น `admin_audit_log`) โค้ดเก่ามักรันกับ schema ใหม่ได้ — ลองย้อนโค้ดอย่างเดียวก่อน
   (`migrate deploy` ของโค้ดเก่าจะไม่ถอย migration ที่ใหม่กว่า และไม่ error)
2. ถ้าไม่ได้ หรือ migration แก้/ลบคอลัมน์ → ย้อนโค้ด **และ** กู้ DB จากไฟล์ backup ที่ entrypoint ทำไว้**ก่อน** migrate ของรุ่นใหม่
   (ไฟล์ที่ timestamp ตรงกับเวลา deploy รุ่นใหม่) ตามขั้นตอน [กู้คืน](./10-operations-troubleshooting.md#การกู้คืนข้อมูล)
   — ข้อมูลที่เกิดหลัง deploy จะหายตามไปด้วย ต้องแจ้งผู้ใช้

> ⚠️ กู้ DB ย้อนหลัง = PO ที่ออก/ส่ง ERP หลังเวลานั้นหายจากฝั่งเรา แต่ ERP ยังมีอยู่ ·
> ก่อนกู้ให้ดู audit log และ `purchaseOrder.erpSentAt` ว่ามีใบไหนส่ง ERP ไปแล้วในช่วงนั้น แล้วจดไว้

## 7. Backup

```bash
docker compose exec vmi node scripts/backup-db.mjs      # production
npm run backup:db                                       # เครื่อง dev (prisma/dev.db → backups/)
```

backup เกิดอัตโนมัติ **2 จังหวะ**

| เมื่อ | หมายเหตุ |
|---|---|
| ทุกรอบ sync ประจำคืน (trigger `scheduler`) | **ไม่ขึ้นกับผลลัพธ์ของ sync** เนื่องจากวันที่ sync ล้มเหลวคือวันที่ควรมีสำเนาข้อมูลมากที่สุด · ปุ่ม sync ที่คนกดไม่ backup |
| ทุกครั้งที่ container start | ก่อน `prisma migrate deploy` |

- เก็บใน volume `vmi_backups` · ย้อนหลัง `BACKUP_KEEP` ไฟล์ (default 14) เกินลบเองจากเก่าสุด
- สร้างด้วย `VACUUM INTO` จึงเป็นไฟล์เดียวที่สมบูรณ์ ไม่ต้องพก `-wal`/`-shm` · ถ้า VACUUM ใช้ไม่ได้ถอยไป copy ไฟล์ (log บอก `(copy)`)
- path relative ใน `DATABASE_URL` นับจากโฟลเดอร์ `prisma/` (กติกาของ Prisma) — บน docker เป็น absolute อยู่แล้ว
- 14 ไฟล์ ≈ 1 สัปดาห์ (sync 1 + restart ~1 ต่อวัน) · **คัดลอกออกนอกเครื่องเป็นระยะ** — volume อยู่บนดิสก์เดียวกับฐานข้อมูล

```bash
# คัดลอก backup ล่าสุดออกมาที่ host
docker compose cp vmi:/app/backups ./vmi-backups-$(date +%F)
```

**วิธีกู้คืน** ดู [10 — ปฏิบัติการ & แก้ปัญหา](./10-operations-troubleshooting.md#การกู้คืนข้อมูล)

## Checklist ก่อนขึ้น production ครั้งแรก

- [ ] `.env` ครบทุกค่าที่ต้องใส่ (ข้อ 1) — **ไม่ต้อง**ตั้ง `NEXT_PUBLIC_*`
- [ ] `NEXTAUTH_SECRET` เป็นค่าสุ่มจริง ≥ 32 ตัว ไม่ใช่ค่าตัวอย่าง
      → การที่ container เริ่มทำงานได้ถือเป็นการทดสอบข้อนี้ในตัว
- [ ] กำหนด `SENDER_EMAIL` (+ `ALERT_EMAIL`) แล้ว **ส่งอีเมลทดสอบ 1 ฉบับ**
- [ ] ตั้ง `STOCK_ONELAKE_*` ครบ — ไม่ตั้ง = C4/cross_target ถอยไปใช้ SP masters แล้ว 403
- [ ] Redirect URI ใน Azure = `https://<โดเมน>/vmi/auth/callback` (SPA, ไม่มี `/` ปิดท้าย)
- [ ] nginx `proxy_pass` ไม่มี `/` ท้าย และตั้ง `X-Real-IP`
- [ ] `curl -fsSL /vmi/api/health/` ตอบ 200 (มี `-L` และ `/` ปิดท้าย)
- [ ] ล็อกอินได้จริงทั้ง 2 ทาง: ร้าน (อีเมล+รหัสผ่าน) · เซลล์/แอดมิน (Microsoft)
      และโหมดผู้ดูแลระบบเข้าดูข้อมูลร้านค้าที่ `/admin/preview/vda`
- [ ] `/admin/data/sync` แสดงข้อมูลครบทุกตาราง · `/admin/data/warehouses` มีทุกคลังพร้อมรหัสลูกค้า
- [ ] scheduler: ใน Docker เปิดเสมอ (compose ฮาร์ดโค้ด) — ถ้าจะใช้ Task Scheduler ภายนอก (`scripts/sync-masters-daily.bat`) ต้องแก้ compose ปิดตัวในโปรเซสก่อน
- [ ] volume `vmi_backups` เขียนได้ (entrypoint จะ backup ก่อน migrate)
- [ ] **ทดสอบการกู้คืนจาก backup 1 ครั้ง** เนื่องจากขั้นตอนที่ยังไม่เคยทดสอบไม่อาจถือว่าใช้งานได้จริง

## บันทึกรุ่น (ทำตามหลัง deploy แต่ละรุ่น)

### หลัง deploy รุ่น 28 ก.ย. 2569 (Creator/Admin + เลิกใช้ cross_salesman + รหัสตั้งค่าร้าน)

migration 2 ตัว (`store_setup_code`, `per_user_notification_reads`) รันเองตอน container start หลัง backup ·
**ไม่ต้องเพิ่มค่าใน `.env`** แต่ต้องทำตามนี้ทันทีหลังขึ้น:

- [ ] **ผูกอีเมลเซลล์ทุกคนกับรหัส** ที่ «ระบบ › สิทธิ์เซลล์-VDA» — ไม่ใช้ cross_salesman แล้ว อีเมลที่ไม่ได้ผูก login ฝั่งเซลล์ไม่ได้
      (Creator = อีเมลใน `ADMIN_EMAILS` เข้าได้เสมอ ใช้บัญชีนี้ผูกให้คนอื่น)
- [ ] ตรวจรายชื่อใน «ระบบ › ผู้ดูแล» — admin ที่เพิ่มผ่านหน้าเว็บกลายเป็น Admin จำกัดสิทธิ์ ใครต้องได้สิทธิ์เต็มให้ใส่ใน `ADMIN_EMAILS`
- [ ] ร้านที่ยังไม่เคยตั้งรหัส ("ยังไม่ตั้งรหัส") กด «ออกรหัสตั้งค่าใหม่» แล้วส่งรหัสให้ร้าน (ใช้ได้ 72 ชม. ครั้งเดียว)
- [ ] ถ้ายังไม่ให้ใครส่ง PO เข้า ERP ใส่ `ERP_SEND_DISABLED=1` (ปิดได้อย่างเดียว เปิดไม่ได้) — โค้ดตอนนี้ `SEND_ENABLED=true` ชี้ UAT
- [ ] **อย่าตั้ง `DEV_LOGIN`** บน server (route `/api/dev/login` ปิดเองใน production อยู่แล้ว แต่ไม่มีเหตุผลต้องตั้ง)
- [ ] แอปต้องเข้าได้ผ่าน nginx เท่านั้น (compose ผูก `127.0.0.1:3002`) — rate limit เชื่อ `X-Real-IP` ที่ nginx ตั้ง

### หลัง deploy รุ่น 29 ก.ย. 2569 (บันทึกการทำงาน + สถานะ ERP ไม่ตอบ + กรองตามรหัสเซลล์)

migration 1 ตัว (`20260929021223_admin_audit_log` — สร้างตาราง `AdminAuditLog` ใหม่ล้วน ไม่แตะตารางเดิม) รันเองตอน container start หลัง backup ·
**ไม่ต้องแก้ `.env`** · rollback ย้อนโค้ดอย่างเดียวได้ (ตารางใหม่ค้างไว้ไม่กระทบโค้ดเก่า)

สิ่งที่เปลี่ยน

- หน้าใหม่ «ระบบ › บันทึกการทำงาน» (`/admin/system/audit`) — **Creator เท่านั้น** จดทุกการเขียนของหน้าตั้งค่า + การลบออเดอร์ + การบันทึกผล ERP
- PO ที่ส่งแล้ว timeout / เน็ตหลุด / HTTP error ขึ้นสถานะใหม่ `erp_unknown` «ERP ไม่ตอบ — รอตรวจ» (เดิมถอยเป็น "ออกแล้ว")
  พร้อมปุ่มในรายละเอียด PO «มีใบนี้ใน ERP แล้ว» / «ไม่มีใน ERP — ส่งใหม่ได้» (ไม่ยิง ERP แค่บันทึกผล ต้องกรอกว่าตรวจกับใคร)
- ตัวเลือกสถานะ PO ที่ server จะปฏิเสธถูกปิดในหน้าจอ · ร้านได้แจ้งเตือน "อนุมัติ + ออก PO" ใบเดียวแทนสองใบ
- Creator กรองออเดอร์ «ตามรหัสเซลล์» (รหัส → VDA ผ่านทะเบียน VDA กติกาเดียวกับสิทธิ์) แทนการกรองตาม `Store.salesRep` ที่เลิกใช้ ·
  API `/api/admin/salesmen` ถูกแทนด้วย `/api/admin/sales-codes` และ `/api/orders?salesCode=`

หลังขึ้น

- [ ] log มี `Applying migration 20260929021223_admin_audit_log`
- [ ] เปิด «ระบบ › บันทึกการทำงาน» ด้วยบัญชี Creator — ลองกดอะไรสักอย่างในหน้าตั้งค่า (เช่น อนุมัติ/รีเซ็ตร้าน) แล้วต้องเห็นแถวใหม่
- [ ] บัญชี Admin (ไม่ใช่ Creator) ต้อง**ไม่เห็น**หน้านี้ (API ตอบ 403)
- [ ] ตัวกรอง «กรองตามรหัสเซลล์» ในหน้าออเดอร์เลือกรหัสแล้วเหลือเฉพาะ VDA ของรหัสนั้น
- [ ] ถ้ามี PO เก่าที่ค้าง "ออกแล้ว" แต่มี `erpError` จากการส่งที่ไม่ชัดเจน — เปิดรายละเอียด PO จะเห็นกล่องแดงพร้อมปุ่มบันทึกผลแล้ว ให้ตรวจกับทีม ERP แล้วเคลียร์
- ข้อมูลเริ่มนับจากวันที่ deploy — ก่อนหน้านั้นไม่มีบันทึก (การลบออเดอร์เก่าดูได้จาก log `[orders:delete]` ของ container เท่านั้น)
- **ห้ามกดส่ง ERP เพื่อ "ทดสอบ" สถานะใหม่** — ยิงจริงไปที่ UAT และเผาเลข PO ได้
