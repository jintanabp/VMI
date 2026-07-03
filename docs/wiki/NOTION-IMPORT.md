# วิธีนำ Wiki เข้า Notion

ไฟล์ใน `docs/wiki/` ออกแบบให้แมปกับ **หน้า Notion แยกกัน** หนึ่งไฟล์ = หนึ่งหน้า

---

## วิธีที่ 1 — Import ทีละหน้า (แนะนำ)

1. สร้าง **Workspace page** ใหม่ใน Notion ชื่อ `VMI Project Wiki`
2. สร้าง **sub-page** ตามรายการด้านล่าง
3. ในแต่ละ sub-page: `⋯` → **Import** → **Markdown** → เลือกไฟล์ที่ตรงกัน
4. จัดลำดับหน้าให้ตรงกับตัวเลขนำหน้า (00–10)

| ไฟล์ | ชื่อหน้าใน Notion |
|------|-------------------|
| `00-home.md` | 🏠 Home |
| `01-overview.md` | 01 — ภาพรวมโปรเจกต์ |
| `02-architecture.md` | 02 — สถาปัตยกรรม |
| `03-authentication.md` | 03 — การยืนยันตัวตน |
| `04-user-guide.md` | 04 — คู่มือผู้ใช้ |
| `05-api-reference.md` | 05 — API Reference |
| `06-fabric-integration.md` | 06 — Fabric / OneLake |
| `07-data-model.md` | 07 — Data Model |
| `08-business-rules.md` | 08 — กฎทางธุรกิจ |
| `09-deployment.md` | 09 — Production Deploy |
| `10-operations-troubleshooting.md` | 10 — ปฏิบัติการ & แก้ปัญหา |

---

## วิธีที่ 2 — Copy-Paste

1. เปิดไฟล์ `.md` ใน editor
2. Copy เนื้อหาทั้งหมด
3. Paste ลง Notion — Notion แปลง Markdown อัตโนมัติ (ตาราง, code block, heading)

> **หมายเหตุ:** Mermaid diagram อาจต้องใช้ Notion integration หรือแปลงเป็นรูปภาพเอง

---

## โครงสร้าง Notion ที่แนะนำ

```
📁 VMI Project Wiki
├── 🏠 Home                    ← 00-home.md
├── 📋 01 — ภาพรวมโปรเจกต์
├── 🏗 02 — สถาปัตยกรรม
├── 🔐 03 — การยืนยันตัวตน
├── 📱 04 — คู่มือผู้ใช้
├── 🔌 05 — API Reference
├── ☁️ 06 — Fabric / OneLake
├── 🗄 07 — Data Model
├── 📐 08 — กฎทางธุรกิจ
├── 🚀 09 — Production Deploy
└── 🛠 10 — ปฏิบัติการ & แก้ปัญหา
```

---

## อัปเดต Wiki

เมื่อโค้ดเปลี่ยน ให้แก้ไฟล์ใน `docs/wiki/` แล้ว re-import หรือ sync หน้าที่เปลี่ยนใน Notion

แหล่งความจริง (source of truth): repository `README.md`, `.env.example`, และโค้ดใน `app/`, `lib/`
