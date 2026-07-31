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
ADMIN_EMAILS=               # คั่นด้วย comma
ALERT_EMAIL=                # รับแจ้งเมื่อ sync ล้ม
DATA_SOURCE=fabric

NEXT_PUBLIC_AZURE_AD_CLIENT_ID=
NEXT_PUBLIC_AZURE_AD_TENANT_ID=
NEXT_PUBLIC_AZURE_REDIRECT_URI=https://spc-ai.sahapat.com/vmi/auth/callback

ONELAKE_*                   # service principal + workspace/lakehouse
STOCK_ONELAKE_*
CFT_*  VDA_AOS_*
```

> ⚠️ **ต้องมี `.env` ครบก่อน `docker compose build`**
> ค่า `NEXT_PUBLIC_*` ถูก bake ลง bundle ตอน build ไม่ได้อ่านตอน runtime
> ถ้าแก้ค่าพวกนี้ต้อง build ใหม่

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

Container รัน `prisma migrate deploy` อัตโนมัติตอน start

### Volumes

| Volume | เก็บอะไร |
|---|---|
| `vmi_data` | SQLite + Fabric CSV cache |
| `vmi_backups` | backup DB หลัง sync สำเร็จ |
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

migration รันเองตอน start · ถ้ามี migration ที่ลบ/เปลี่ยนคอลัมน์ ให้ backup ก่อน

## 6. Backup

```bash
docker compose exec vmi node scripts/backup-db.mjs
```

ระบบ backup ให้อัตโนมัติทุกครั้งที่ sync สำเร็จ เก็บไว้ใน volume `vmi_backups`

## Checklist ก่อนขึ้น production

- [ ] `.env` ครบทุกค่า โดยเฉพาะ `NEXT_PUBLIC_*`
- [ ] `NEXTAUTH_SECRET` เป็นค่าสุ่มจริง ไม่ใช่ค่า default
- [ ] Redirect URI ใน Azure ตรงกับโดเมนจริง (มี `/vmi`)
- [ ] nginx `proxy_pass` ไม่มี `/` ท้าย
- [ ] `curl /vmi/api/health` ตอบ 200
- [ ] ล็อกอินทั้ง 3 ทางได้จริง (VDA / ร้าน / Microsoft)
- [ ] `/admin/sync` แสดงข้อมูลครบทุกตาราง
- [ ] ตั้ง `MASTER_REFRESH_ENABLED` ให้ถูก (ถ้าใช้ Task Scheduler ภายนอกต้องปิดตัวในโปรเซส)
