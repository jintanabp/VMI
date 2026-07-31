# VMI — แผนปรับปรุงระบบ (Improvement Plan)

> วิธีใช้: ทำเสร็จข้อไหนให้เปลี่ยน `[ ]` เป็น `[x]` และเติมผลการตรวจสอบใต้ข้อนั้น
> **กติกา:** ทุกข้อต้อง (1) แก้ (2) `npm run build` ผ่าน (3) verify เฉพาะจุด (4) ยืนยันไม่กระทบระบบเดิม ก่อนติ๊ก
> **สำคัญ:** หยุด `npm run dev` ก่อนรัน `npm run build` — ใช้โฟลเดอร์ `.next/` ร่วมกัน ไม่งั้นเจอ error โมดูลหายที่ไม่ใช่บั๊กจริง

รายละเอียดของงานที่ปิดไปแล้วอยู่ใน git history — ไฟล์นี้เก็บเฉพาะงานที่ยังค้าง

---

## งานค้างจากรอบก่อน (14 ก.ค. 2569)

### [ ] A1b อนุมัติเฉพาะบางรายการในออเดอร์
- ส่วน "อนุมัติหลายออเดอร์รวดเดียว" ทำแล้ว (31 ก.ค.) — เหลือเคสที่ยากกว่า
- ตอนนี้อนุมัติเป็นระดับ**ออเดอร์**เท่านั้น (`approveWithPoSplit` พลิกทั้งใบ) เลือกอนุมัติบางบรรทัดไม่ได้
- ต้องรื้อ: approve schema ใน `app/api/orders/route.ts`, `lib/po/approve-with-split.ts`,
  `proposePoSplit`/`validatePoSplit` และต้องมีสถานะระดับบรรทัด (ตก/เลื่อน)
- ทางเลี่ยงที่มีอยู่: `action: "updateQty"` ตั้ง `finalQty: 0` ทีละรายการ (ไม่ลบบรรทัดออกจาก PO)
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] A2 แนวโน้ม 90 วัน + %WoW + moving average
- `components/stock/product-sales-panel.tsx` ยังเป็น `const DAY_OPTIONS = [7, 30] as const;`
- ต้องเช็คก่อนว่า sold-history มีข้อมูลย้อนหลังพอ 90 วันหรือไม่ (`MAX_DAYS_KEPT`)
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] A3 Dashboard เซลส์ (pending, approval rate, ร้านที่ธงแดงเยอะ)
- view ใหม่ใต้ `app/sales/` + ใช้ `/api/orders` เดิม
- **ผลตรวจสอบ:** _(รอทำ)_

---

## งานค้างจากรอบ 31 ก.ค. 2569

### [ ] B0 ปุ่ม "ทุก VDA ของฉัน" ในหน้า PO
- หน้าตรวจออเดอร์มีปุ่มนี้ (ส่ง `allPersonVdas=true`) แต่ `app/api/sales/purchase-orders/route.ts` ยังไม่รับ param นี้
- ตอนนี้ route PO fallback ไป `resolveAllPersonVdaCodes` เฉพาะเมื่อรหัสที่ใช้อยู่ไม่มี VDA เลย
- dropdown เลือก VDA ทำแล้ว (31 ก.ค.) เหลือแค่ปุ่มนี้
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] B1 สถานะ PO (lifecycle)
- ตอนนี้ `PurchaseOrder` ไม่มีคอลัมน์สถานะเลย — ออกแล้วก็จบ ตามต่อไม่ได้ว่าส่งซัพ/รับของหรือยัง
- ต้องตกลง flow กับฝ่ายจัดซื้อก่อนออกแบบค่าสถานะ แล้วค่อยเพิ่มคอลัมน์ + migration
- **ไฟล์:** `prisma/schema.prisma` (`PurchaseOrder`), `components/sales/sales-po-client.tsx`
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] B2 อัปเดต `README.md` — ส่วน PO ยังเขียนว่าเป็น stub
- README บอกว่า PO ยัง export เป็น JSON ที่ `logs/po-export/{orderId}.json` เฉย ๆ
- ของจริงมี `PurchaseOrder`/`PoSequence` ใน DB, `lib/po/*` (เลข PO, การแบ่งใบ, เอกสาร), หน้า `/sales/po` และ Excel export แล้ว
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] B3 `docs/wiki/` — index ชี้ไปไฟล์ที่ไม่มีอยู่จริง
- `docs/wiki/00-home.md` ลิงก์ไป `01-overview.md` … `10-operations-troubleshooting.md` **ครบ 10 ไฟล์ที่ไม่มีสักไฟล์**
- และมีข้อมูลเก่าค้าง: URL ไม่มี basePath `/vmi`, พอร์ต production เขียน 3001 แต่ README เขียน 3002
- **ตัดสินใจ:** เขียนให้ครบ หรือลบ index + `NOTION-IMPORT.md` ทิ้ง
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] B4 ไม่มี test framework
- มีแค่ `npm run verify:*` scripts (sales-cover, promo-context, snapshot-promo-baseline)
- ควรมี vitest คลุมส่วนที่เป็น logic ล้วนและพังแล้วเจ็บ:
  `lib/calculations` (`getOrderCvdFlag`, `resolveOrderLinePrice`), `lib/po/split-plan`, `lib/stock/sort`, `lib/promo`
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] B5 หน้า `/order` แก้จำนวนไม่ได้ ต้องเด้งกลับ `/stock`
- เป็นต้นตอเดียวกับบั๊กที่แก้ไปเมื่อ 31 ก.ค. (ติดธงแดงแล้วส่งไม่ได้ ทั้งที่หน้านั้นแก้จำนวนไม่ได้)
- แก้เฉพาะหน้าไปแล้ว (เปลี่ยนจากห้ามส่งเป็นให้ยืนยัน) แต่ทางออกที่ดีกว่าคือใส่ qty stepper ในหน้านี้เลย
- **ไฟล์:** `components/order/order-page-client.tsx`, ใช้ `components/stock/stock-qty-stepper.tsx` ซ้ำได้
- **ผลตรวจสอบ:** _(รอทำ)_

---

## บันทึกการทำงาน (Changelog)

- 2026-07-14 — **Phase 1 correctness เสร็จ 5/5** (non-VDA เห็นยอดร้านอื่น, resolveAvgSales fallback L30,
  threshold CVD ร้าน↔เซลส์, timezone โปร/ราคา, ป้ายสินค้าใหม่)
- 2026-07-14 — **Phase 2 performance เสร็จ 7/7** (preload masters ตอน boot 2,852ms→0ms, parseCsv single-pass,
  ensureSkus O(n²)→Map, `$transaction`, per-store cache invalidation, content-visibility, ResizeObserver)
- 2026-07-14 — **Phase 3 consistency เสร็จ 6/6** (react-query cache, parseNum comma, avg-sales self-describing,
  รวม normalizeStoreKey/formatBaht, error+retry states, cutoff จาก latestDate)
- 2026-07-14 — ฟีเจอร์ 4.1 / 4.5 / 4.7 / 4.8 / 4.9 เสร็จ (สต็อกวิกฤต, smart min/max, badge ออเดอร์รอตรวจ,
  badge โปรหมดใน X วัน, KPI tile กดกรองได้) · visual QA โดยผู้ใช้ผ่าน
- 2026-07-29 — ✅ 4.2 Export Excel (`app/api/stock/export/route.ts`, `lib/stock/export-order-form.ts`, exceljs)
  **หมายเหตุ:** แผนเดิมติ๊กข้อนี้ค้างเป็น `[ ]` ทั้งที่ทำเสร็จแล้ว — เก็บตกในรอบ 31 ก.ค.
- 2026-07-30 — PO split + ราคาเซลส์, store notifications, price override, หน้าประวัติการสั่งซื้อ, admin UI
  (ทำหลังวันที่แก้ไขแผนเดิม จึงไม่เคยมีบันทึกในไฟล์นี้)
- 2026-07-31 — รอบปรับปรุงตามคำขอผู้ใช้:
  - ✅ แก้บั๊ก `/order` ติดธงแดงแล้วกดส่งไม่ได้ — เปลี่ยนไปใช้ `getOrderCvdFlag` ตัวเดียวกับหน้า `/stock`
    (ยกเว้นเคสของหมด / 1 หีบขั้นต่ำ) แล้วเปลี่ยนจาก "ห้ามส่ง" เป็น "ยืนยันอีกครั้ง"
  - ✅ ร้านยกเลิกออเดอร์ตัวเองได้ (`app/api/store/orders/route.ts` + ปุ่มในหน้าประวัติ)
  - ✅ แจ้งเตือนสองทาง — เพิ่ม `SalesNotification` (ร้านส่ง/ยกเลิกออเดอร์ → เซลล์),
    เพิ่ม kind `po_issued`, แจ้งราคา/จำนวนแบบระบุ SKU และค่าเดิม→ค่าใหม่
  - ✅ Toast ในแอป (`components/ui/toast.tsx` เขียนเอง ไม่เพิ่ม dependency) + auto อ่านเมื่อเปิดหน้าประวัติ
  - ✅ หน้าประวัติการสั่งซื้อ — timeline, ราคา/มูลค่าต่อบรรทัด, ตัวกรองวันที่, ปุ่มสั่งซ้ำ
  - ✅ หน้า PO — ดูรายละเอียดในเว็บ + พิมพ์, fallback ประกอบเอกสารจาก DB เมื่อไฟล์หาย,
    ค้นหา/กรองวันที่/แบ่งหน้าฝั่ง server, สรุปตามผลกรองทั้งหมด, export หลายใบเป็นไฟล์เดียว
  - ✅ ตาราง stock เรียงตามรหัสสินค้าน้อย→มากเป็นค่าเริ่มต้น (bump `SORT_STORAGE_KEY` เป็น v2)
- 2026-07-31 (รอบ 2) — **ปิดช่องโหว่ข้อมูลโปร/ของแถม**:
  - ✅ เดิมตอนร้านกดส่ง ระบบเรียก `lookupOrderPromoLines()` ได้ข้อมูลโปรครบแล้ว**ทิ้งทั้งหมด**
    เก็บแค่ 6 ฟิลด์ราคา · เอกสาร PO ที่ส่งฝ่ายจัดซื้อ hardcode `promoGroup: null` ทั้ง 2 ที่
    → ร้านสั่งของโดยคาดว่าได้ของแถม แต่ไม่มีอะไรบันทึกว่าควรได้อะไร
  - ✅ เพิ่ม `OrderItem.c4Promo*` / `c4FreeGood*` / `c4PooledQty` (migration `20260731031133`)
    เขียนตอน POST · ไหลเข้าเอกสาร PO, Excel ทั้ง 2 ที่, หน้ารายละเอียด PO, หน้าประวัติร้าน
  - ✅ `lib/promo/order-free-goods.ts` — `collectOwedFreeGoods()` กันของแถมโปรกลุ่มคูณซ้ำ
    (โปรกลุ่มคืน freeGood ก้อนเดียวกันทุกบรรทัด) · ทดสอบ 8 เคสผ่านหมด
  - ✅ อนุมัติหลายออเดอร์รวดเดียว + ปุ่ม "เลือกทั้งหมดที่ไม่มีธงแดง"
    (ยิงทีละใบ ไม่ขนาน เพราะ `PoSequence` ตัวเดียวกัน) พร้อมสรุปผลรายใบ
  - ✅ `Order.decidedAt` — เดิม `rejectOrder()` ไม่เขียนเวลาเลย ออเดอร์ที่ถูกปฏิเสธจึงขึ้น
    "รอดำเนินการ" ใน timeline ตลอด
  - ✅ `hooks/use-vda-options.ts` ใช้ร่วมหน้าตรวจออเดอร์กับหน้า PO · dropdown เลือก VDA ในหน้า PO
    · เรียงตามเลข PO · auto รับทราบเฉพาะ "ออเดอร์ใหม่" ฝั่งเซลล์ (ไม่แตะ "หยุดสั่ง" เพราะเป็นการยืนยันของคน)
  - ⚠️ **ออเดอร์เก่ากู้ไม่ได้** ข้อมูลโปรไม่เคยถูกเขียน — UI แสดง "—" เฉพาะออเดอร์ใหม่ที่มีข้อมูล
  - ⚠️ เส้นทาง dedupe โปรกลุ่มยังไม่เคยเจอของจริง: vda2 มี 8 กลุ่มที่มีของแถม (สมาชิกสูงสุด 17 SKU)
    แต่ร้านสต็อกไว้กลุ่มละ 1 SKU เท่านั้น — บั๊กคูณซ้ำจะโผล่เมื่อร้านสต็อก ≥2 SKU ในกลุ่มเดียวกัน
