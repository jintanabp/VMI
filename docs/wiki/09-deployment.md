[← กลับหน้าแรก](./00-home.md)

# 09 — Production Deploy

Deploy ด้วย Docker Compose หลัง nginx ที่ path `/vmi/`

## 1. เตรียม `.env`

```bash
cp .env.example .env
```

ค่าที่ต้องใส่จริง

```bash
NEXTAUTH_SECRET=            # openssl rand -base64 32
                            # !! ต้อง >= 32 ตัว และไม่ใช่ค่าตัวอย่างใน .env.example
                            #    มิฉะนั้น container จะไม่เริ่มทำงาน (ออกแบบให้หยุดทันที)
ADMIN_EMAILS=               # คั่นด้วย comma
ALERT_EMAIL=                # ผู้รับแจ้งเมื่อ sync ล้ม
SENDER_EMAIL=               # mailbox ผู้ส่ง (Graph Mail.Send) — ขาดตัวนี้ = ไม่มีอีเมลออก
DATA_SOURCE=fabric

ONELAKE_*                   # service principal + workspace/lakehouse
STOCK_ONELAKE_*
CFT_*  VDA_CUSTOMER_MAP  VDA_CODES
```

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
curl -s http://127.0.0.1:3002/vmi/api/health
```

| รายการ | ค่า |
|---|---|
| Host port | **3002** (bind `127.0.0.1` เท่านั้น) |
| Container port | 3000 |
| Container / project name | `vmi` |

ลำดับตอน container start (`docker/entrypoint.sh`)

1. **backup ฐานข้อมูล** (ปิดได้ด้วย `VMI_BACKUP_ON_START=false` · default เปิด)
2. `prisma migrate deploy`
3. `next start`

> backup ต้องมา**ก่อน** migrate — migration ที่ลบ/เปลี่ยนคอลัมน์ย้อนกลับไม่ได้
> หากสำรองหลัง migrate สำเนาที่ได้จะเป็นข้อมูลหลังการเปลี่ยนแปลงไปแล้ว

### Volumes

| Volume | เก็บอะไร |
|---|---|
| `vmi_data` | SQLite (`/app/data/vmi.db`) + Fabric CSV cache |
| `vmi_backups` | backup DB (`/app/backups/vmi-<timestamp>.db`) |
| `vmi_logs` | ไฟล์เอกสาร PO (`logs/po-export/`) |

> `vmi_logs` ไม่ใช่แค่ log — มีไฟล์ PO ที่เป็นหลักฐานอยู่ **ห้ามลบทิ้ง**
> (ถ้าหายจริง ระบบยังประกอบเอกสารจาก DB ให้ได้ แต่จะเสียหลักฐานต้นฉบับ)

## 3. nginx

Next.js ตั้ง `basePath: '/vmi'` ไว้แล้ว — **ห้ามตัด prefix ออกใน `proxy_pass`**

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

`client_max_body_size 50M` เผื่อ Excel export ใบใหญ่ · timeout 120s เผื่อ sync ที่ใช้เวลานาน

## 4. Azure Portal

เพิ่ม Redirect URI (ประเภท SPA)

```
https://spc-ai.sahapat.com/vmi/auth/callback
```

## 5. อัปเดตเวอร์ชันใหม่

```bash
git pull
docker compose up -d --build
curl -s http://127.0.0.1:3002/vmi/api/health
```

migration รันเองตอน start — และมี backup ให้ก่อนแล้วอัตโนมัติ

## 6. Backup

```bash
docker compose exec vmi node scripts/backup-db.mjs
```

backup เกิดอัตโนมัติ **2 จังหวะ**

| เมื่อ | หมายเหตุ |
|---|---|
| ทุกรอบ sync ประจำคืน | **ไม่ขึ้นกับผลลัพธ์ของ sync** เนื่องจากวันที่ sync ล้มเหลวคือวันที่ควรมีสำเนาข้อมูลมากที่สุด |
| ทุกครั้งที่ container start | ก่อน `prisma migrate deploy` |

เก็บใน volume `vmi_backups` · ย้อนหลัง `BACKUP_KEEP` ไฟล์ (default 14)
สร้างด้วย `VACUUM INTO` จึงเป็นไฟล์เดียวที่สมบูรณ์ ไม่ต้องพก `-wal`/`-shm`

**วิธีกู้คืน** ดู [10 — ปฏิบัติการ & แก้ปัญหา](./10-operations-troubleshooting.md#กู้คืน)

## Checklist ก่อนขึ้น production

- [ ] `.env` ครบทุกค่า โดยเฉพาะ `NEXT_PUBLIC_*`
- [ ] `NEXTAUTH_SECRET` เป็นค่าสุ่มจริง ≥ 32 ตัว ไม่ใช่ค่าตัวอย่าง
      → การที่ container เริ่มทำงานได้ถือเป็นการทดสอบข้อนี้ในตัว
- [ ] กำหนด `SENDER_EMAIL` คู่กับ `ALERT_EMAIL` แล้ว **ส่งอีเมลทดสอบ 1 ฉบับ**
- [ ] Redirect URI ใน Azure = `https://<โดเมน>/vmi/auth/callback` (SPA, ไม่มี `/` ปิดท้าย)
- [ ] nginx `proxy_pass` ไม่มี `/` ท้าย
- [ ] `curl -fsSL /vmi/api/health/` ตอบ 200 (มี `-L` และ `/` ปิดท้าย)
- [ ] ล็อกอินได้จริงทั้ง 2 ทาง: ร้าน (อีเมล+รหัสผ่าน) · เซลล์/แอดมิน (Microsoft)
      และโหมดผู้ดูแลระบบเข้าดูข้อมูลร้านค้าที่ `/admin/preview/vda`
- [ ] `/admin/data/sync` แสดงข้อมูลครบทุกตาราง
- [ ] ตั้ง `MASTER_REFRESH_ENABLED` ให้ถูก (ถ้าใช้ Task Scheduler ภายนอกต้องปิดตัวในโปรเซส)
- [ ] volume `vmi_backups` เขียนได้ (entrypoint จะ backup ก่อน migrate)
- [ ] **ทดสอบการกู้คืนจาก backup 1 ครั้ง** เนื่องจากขั้นตอนที่ยังไม่เคยทดสอบไม่อาจถือว่าใช้งานได้จริง
