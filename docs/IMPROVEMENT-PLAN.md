# VMI — แผนปรับปรุงระบบ (Improvement Plan)

> สร้างจากการรีวิวภาพรวมระบบ (backend performance / correctness / frontend+features)
> วิธีใช้: ทำเสร็จข้อไหนให้เปลี่ยน `[ ]` เป็น `[x]` และเติมผลการตรวจสอบใต้ข้อนั้น
> **กติกา:** ทุกข้อต้อง (1) แก้ (2) `npm run build` ผ่าน (3) verify เฉพาะจุด (4) ยืนยันไม่กระทบระบบเดิม ก่อนติ๊ก

สถานะ: `ACTIVE` = เกิดผลตอนนี้ · `LATENT` = รอเงื่อนไขข้อมูลบางแบบ

---

## Phase 1 — บั๊ก Correctness (ACTIVE, ทำก่อน)

### [x] 1.1 ร้าน non-VDA เห็นยอดขายรายวันของทุกร้านรวมกัน
- **ปัญหา:** `lib/fabric/sold-history.ts:180` `getSummary` fallback ไป `aggregateByDate` เมื่อไม่เจอ store key → ร้าน non-VDA (เช่น `r087`) เห็นยอดรวม VDA1–5 เป็นของตัวเอง
- **แก้:** ตัด fallback `aggregateByDate` (ลบ method + call) — ใช้เฉพาะ key ตรง หรือ bucket ว่าง (ไฟล์ไม่มีคอลัมน์ร้าน) แล้วคืน `hasData:false`
- **ไฟล์:** `lib/fabric/sold-history.ts`
- **Verify:** getSummary(non-VDA) → `hasData:false`; getSummary(vda1) ยังได้ข้อมูล; `npm run build`; `npm run verify:sales-cover` ยัง PASS
- **ผลตรวจสอบ:** ✅ 2026-07-14 · unit check (CSV จริง): `vda1`→hasData=true total=2368 · `r087`→hasData=false total=0 · build ผ่าน · verify:sales-cover PASS 856/856

### [x] 1.2 resolveAvgSales: L7=0 บล็อก fallback ไป L30 → ไม่แนะนำสั่งของ
- **ปัญหา:** `lib/fabric/stock-rows.ts:84` `avgQtyOutL7 ?? avgQtyOutL30 ?? 0` — ค่า `0` ไม่ใช่ null จึงไม่ตกไป L30 · SKU ที่ 30 วันขายดีแต่ 7 วันเงียบ → avgSales=0 → ไม่แนะนำสั่ง
- **แก้:** ใช้ L7 เฉพาะเมื่อ `> 0` ไม่งั้น fallback `L30 ?? l7 ?? 0`
- **ไฟล์:** `lib/fabric/stock-rows.ts`
- **Verify:** row ที่ L7=0 & L30>0 → avgSales = L30; `npm run build`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน (type check) · logic: L7=0/L30=5→5, L7=3/L30=9→3, null/null→0, L7=null/L30=4→4

### [x] 1.3 ธง CVD ฝั่งร้าน vs เซลส์ ใช้ threshold คนละชุด
- **ปัญหา:** `components/sales/order-review-table.tsx:301,413` เรียก `getCvdFlag` ไม่ส่ง min/max → default 7/20 · `OrderItem` ไม่เก็บ min/max เซลส์ reproduce สีที่ร้านเห็นไม่ได้
- **แก้:** เพิ่ม `minDays/maxDays` (nullable) ใน `OrderItem` (migration `20260714035025`) · "แช่แข็ง" ตอน POST · ฝั่งเซลส์ส่งเข้า `getCvdFlag` (null→undefined = ออเดอร์เก่าใช้ default เดิม)
- **ไฟล์:** `prisma/schema.prisma`, `lib/repositories/types.ts`, `lib/repositories/prisma-repository.ts`, `app/api/orders/route.ts`, `components/order/order-page-client.tsx`, `components/sales/order-review-table.tsx`, `components/sales/sales-orders-client.tsx`
- **Verify:** สร้าง order จากร้าน → เปิดฝั่งเซลส์ → สีตรงกับที่ร้านเห็น
- **ผลตรวจสอบ:** ✅ 2026-07-14 · migration additive (nullable, ไม่เสียข้อมูล) · e2e จริง: persist min/max=3/10 · store=green, rep เดิม=red(บั๊ก), rep ใหม่=green ✓ · ลบออเดอร์ทดสอบแล้ว · build + prisma generate ผ่าน · server 200

### [x] 1.4 หน้าต่างโปรโมชัน/ราคาเพี้ยน — วันสุดท้ายหาย + เลื่อน 7 ชม.
- **ปัญหา:** `lib/fabric/promotion-credit.ts:72-76` + `lib/fabric/sku-master.ts:91` เทียบ `new Date()` (มีเวลา) กับ `Date.parse("YYYY-MM-DD")` (UTC เที่ยงคืน) → โปรวันสุดท้ายดับกลางเช้าเวลาไทย
- **แก้:** สร้าง `lib/fabric/bkk-date.ts` (`bangkokDateStr`/`isoDateStr`) เทียบเป็น date-string โซน Asia/Bangkok inclusive ทั้งสองที่
- **ไฟล์:** `lib/fabric/bkk-date.ts` (ใหม่), `lib/fabric/promotion-credit.ts`, `lib/fabric/sku-master.ts`
- **Verify:** โปรที่ toDate = วันนี้ → ยัง active ตลอดวันตามเวลาไทย
- **ผลตรวจสอบ:** ✅ 2026-07-14 · unit check: promo วันสุดท้าย=วันนี้→active, จบเมื่อวาน→inactive, เริ่มพรุ่งนี้→inactive · price วันสุดท้าย→ไม่ expired (99) · build ผ่าน

### [x] 1.5 ป้าย "สินค้าใหม่" อิงเวลา sync ครั้งแรก ไม่ใช่วันสินค้าเข้าจริง
- **ปัญหา:** `lib/fabric/stock-rows.ts:311` ใช้ `Sku.createdAt` ที่ default `now()` ตอน `ensureSkus` → sync ครั้งแรกทุก SKU "ใหม่" พร้อมกัน
- **แก้:** ใน `ensureSkus` ถ้า `prisma.sku.count()===0` (bulk import ครั้งแรก) → backdate `createdAt` พ้นหน้าต่าง NEW_PRODUCT_DAYS · install ที่มีข้อมูลแล้วไม่กระทบ
- **ไฟล์:** `lib/fabric/stock-rows.ts` (ensureSkus)
- **Verify:** install นี้ table ไม่ว่าง → no-op; fresh install → ไม่มีสินค้าขึ้นใหม่พร้อมกัน
- **ผลตรวจสอบ:** ✅ 2026-07-14 · DB จริง: 834 SKU, ติดป้ายใหม่ 3 (สุขภาพดี) · count>0 → path เดิม ไม่ regress · build ผ่าน
- **หมายเหตุ backfill:** ทดสอบ path backdate เต็ม ๆ ต้องใช้ DB เปล่า (เลี่ยงล้าง table นี้) · ถ้ามี install ที่เคย "ทุกตัวขึ้นใหม่" ให้ backfill ครั้งเดียว: `UPDATE "Sku" SET "createdAt" = <เก่ากว่า 30 วัน> WHERE ...`

---

## Phase 2 — Performance / หน่วง

### [x] 2.1 preload masters ตอน boot (ย้ายต้นทุน parse ออกจาก request path)
- **ปัญหา:** request แรกเรียก `ensureFabricMastersFresh()` เจอ `fabricCacheMtimes.size===0` → stale → `reloadFabricMasters()` parse ไฟล์ SKU 68MB แบบ sync บน request thread
- **แก้:** (1) เพิ่ม `warmFabricMasters()` เรียกใน `instrumentation.register()` — preload ตอน boot · (2) refactor `ensureFabricMastersFresh`: ถ้า master โหลดแล้ว (preload/lazy getter) → prime mtime เฉย ๆ ไม่ reload ซ้ำ (robust แม้ instrumentation กับ route คนละ scope)
- **ไฟล์:** `instrumentation.ts`, `lib/fabric/index.ts`
- **Verify:** cold ensureFresh (ที่เคยตกที่ request แรก) vs หลัง preload
- **ผลตรวจสอบ:** ✅ 2026-07-14 · **cold ensureFresh = 2,852ms → หลัง preload = 0ms** · robust test: ensureFresh หลัง lazy getter = 1ms (ไม่ reload 68MB ซ้ำ) · boot log `preloaded in 2785ms` · build + server 200
- **หมายเหตุ:** ส่วน "stream parse csv" แยกไปข้อ 2.2 (parse ไฟล์เร็ว/กิน RAM น้อยลง)

### [x] 2.2 parseCsv ลด buffer ซ้อน + stream ไฟล์ใหญ่ (ไม่ copy object ต่อแถวซ้ำ)
- **ปัญหา:** `lib/fabric/csv.ts` split→filter→object ทุกคอลัมน์ แล้ว `normKeys` copy อีกชั้น · sku-master เก็บ array 110k แถวที่ไม่ได้ใช้ (แค่เช็ค isLoaded)
- **แก้:** (1) `parseCsv` single-pass ผ่าน `forEachCsvLine` (เลิก split+filter 2 array) · (2) เพิ่ม `streamCsvFile` (lower-case header ครั้งเดียว, ไม่เก็บ array) · (3) `sku-master.load` ใช้ stream + เลิกเก็บ `rows[]` → `loadedCount`
- **ไฟล์:** `lib/fabric/csv.ts`, `lib/fabric/sku-master.ts`
- **Verify:** จำนวน parse เท่าเดิม + `verify:sales-cover` PASS
- **ผลตรวจสอบ:** ✅ 2026-07-14 · **sku-master: 109576 rows / 38322 priced — เท่าเดิมเป๊ะ** · parseCsv factsales 8563 แถว เท่าเดิม · lookup ทำงาน (price 1050) · verify:sales-cover PASS · build ผ่าน
- **หมายเหตุ:** true async streaming (ไม่อ่านทั้งไฟล์เข้า RAM) เป็น step ถัดไปถ้าต้องการ — ต้องเปลี่ยน load เป็น async

### [x] 2.3 ensureSkus O(n²) → Map lookup O(1)
- **ปัญหา:** `lib/fabric/stock-rows.ts:102,112` `coverRows.find()` ใน `.map()` 2 รอบ
- **แก้:** สร้าง `nameByCode` Map ครั้งเดียว ใช้แทน `.find()` ทั้ง toCreate และ namesToUpdate
- **ไฟล์:** `lib/fabric/stock-rows.ts`
- **Verify:** ผล payload เท่าเดิม; `npm run build`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · e2e vda1: 804 แถว ครบชื่อ+skuId (151ms) · build ผ่าน

### [x] 2.4 Prisma UPDATE ยิงทีละชื่อ (write N+1) → batch transaction
- **ปัญหา:** `lib/fabric/stock-rows.ts:121-127` `Promise.all(map(prisma.sku.update))` = update อิสระ N ตัว
- **แก้:** รวมเป็น `prisma.$transaction([...])` เดียว (ลด round-trip + กัน SQLite lock)
- **ไฟล์:** `lib/fabric/stock-rows.ts`
- **Verify:** payload ยังถูก, ไม่ error; `npm run build`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · e2e ผ่าน (ใน 2.3) · build ผ่าน

### [x] 2.5 แก้ threshold/blocklist ไม่ล้าง cache ทุกร้าน (per-store invalidation)
- **ปัญหา:** `bumpStockDataVersion()` เป็น version รวม เรียก 7 จุด (per-sku/section/blocklist) → แก้ร้านหนึ่งล้าง `payloadCache` ทุกร้าน
- **แก้:** เปลี่ยน `data-version` เป็น **version ต่อร้าน** (`bumpStoreDataVersion(storeId)`/`storeDataVersion(storeId)`) · ผูก version ไว้ใน cacheKey ของ payload + prune entry เก่า · clear ทั้งชุดเฉพาะตอน mtime เปลี่ยน (sync)
- **ไฟล์:** `lib/fabric/data-version.ts`, `lib/fabric/stock-rows.ts`, `lib/repositories/prisma-repository.ts`, `app/api/store/thresholds/route.ts`, `app/api/store/blocklist/route.ts`
- **Verify:** bump ร้าน A → A recompute, ร้าน B cache ไม่หลุด
- **ผลตรวจสอบ:** ✅ 2026-07-14 · object-ref test: A recompute(ref ใหม่), B ยัง cache เดิม(ref เดิม) · cache hit ก่อน bump ทั้ง A/B · build ผ่าน
- **หมายเหตุ:** ส่วน "คืนแถวเดียวโดยไม่ rebuild ทั้งร้าน" ยังคง rebuild ร้านนั้น (cache หลังจากนั้น) — การล้าง cache ข้ามร้านซึ่งเป็นจุดเสียหลักถูกแก้แล้ว

### [x] 2.6 ลดต้นทุน render รายการมือถือ (content-visibility)
- **ปัญหา:** `stock-page-client.tsx:848` มือถือ render การ์ดทุกแถว (virtualize gate ไว้ที่ desktop)
- **แก้:** ใช้ `content-visibility: auto` + `contain-intrinsic-size` บนการ์ด → browser ข้าม layout/paint การ์ดนอกจอ (ได้ผลเดียวกับ virtualize แต่ไม่รื้อ grid layout เสี่ยงต่ำ)
- **ไฟล์:** `app/globals.css` (`.vmi-cv-auto`), `components/stock/stock-page-client.tsx`
- **Verify:** class applied + อยู่ใน built CSS + build
- **ผลตรวจสอบ:** ✅ 2026-07-14 · `.vmi-cv-auto` ใน source + built CSS · build ผ่าน · (perf จริงยืนยันบนมือถือได้ แต่กลไกถูกต้อง)

### [x] 2.7 virtualizer วัดความสูงจริงของแถวที่กางออก
- **ปัญหา:** `stock-page-client.tsx` ใช้ estimate ตายตัว (+200) → scroll กระตุกตอน expand / toggle 7↔30 ในแผง
- **แก้ (แบบเสี่ยงต่ำ ไม่รื้อตาราง):** วัดความสูงจริงของแผงด้วย `ResizeObserver` (คอมโพเนนต์ `ExpandedMeasure`) เก็บใน `expandedHeights` ref แล้ว feed เข้า `estimateSize` + เรียก `rowVirtualizer.measure()` — คงโครงสร้างตาราง native (colgroup/tbody) ไว้ ไม่ต้องเปลี่ยนเป็น absolute-positioning
- **ไฟล์:** `components/stock/stock-page-client.tsx`
- **Verify:** build + visual QA (login ร้าน, desktop) → expand/toggle 7↔30/scroll ไม่มี jump
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน · **visual QA โดยผู้ใช้: ผ่าน** (ไม่มี scroll jump)

---

## Phase 3 — ความไม่สอดคล้อง / โค้ดซ้ำ

### [x] 3.1 cache ใน product-sales-panel ไม่ invalidate → ย้ายไป react-query
- `components/stock/product-sales-panel.tsx` ลบ module `Map` → `useQuery` key `["sales-daily", sku, fromDb, days]` (staleTime 5m, gcTime 10m) · ปุ่มรีเฟรชใน stock-page-client invalidate `["sales-daily"]` เพิ่ม
- **ไฟล์:** `product-sales-panel.tsx`, `stock-page-client.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน · cache ผูก key (ไม่รั่วข้ามร้าน) + รีเฟรชล้างได้ (โครงสร้าง react-query การันตี)

### [x] 3.2 stock-cover.parseNum ไม่ตัด comma (LATENT)
- `lib/fabric/stock-cover.ts:31` เพิ่ม `.replace(/,/g,"")` ก่อน `Number()`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน · verify:sales-cover PASS (ตอนนี้ข้อมูลไม่มี comma — เป็นการกัน future) · ดูเพิ่มการรวม parser ที่ 3.4

### [x] 3.3 avg ยอดขาย 2 แหล่ง — ทำให้แยกออกชัด (self-describing)
- **บริบท:** popup ใช้ factsales (ยอดบิลจริง), คอลัมน์แถวใช้ stock_cover `avg_qty_out_L7` (คลัง) — เป็น 2 metric คนละแหล่งโดยเจตนา · pipeline align กันแล้ว (verify 856/856) และคอลัมน์แถวมี tooltip บอกแหล่งอยู่แล้ว
- **แก้:** เพิ่ม "· บิล" + tooltip ที่หัว popup ให้ผู้ใช้เข้าใจว่าเป็นยอดจากบิล (ต่างจากคอลัมน์คลัง) — ไม่ force single-source เพราะทั้งคู่มีประโยชน์
- **ไฟล์:** `components/stock/product-sales-panel.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน · verify:sales-cover PASS

### [x] 3.4 รวม normalizer/formatter ที่ซ้ำ/drift
- **ทำแล้ว:** (A) `normalizeStoreKey` → `lib/fabric/store-key.ts` ใช้ร่วม sold-history + vda-aos-bill (`normVda` เดิม lowercase อย่างเดียว → รองรับ `VDA_1` ด้วย) + verify script · (B) `formatBaht` → `lib/calculations` รวม 3 ที่ (order-page, order-review, order-confirm-modal) · order-confirm-modal เดิมใช้ `฿` prefix + em-dash → เปลี่ยนเป็น "บาท" suffix ให้ตรง order flow
- **ไฟล์:** `lib/fabric/store-key.ts` (ใหม่), `lib/calculations/index.ts`, `sold-history.ts`, `vda-aos-bill.ts`, `scripts/verify-sales-cover.ts`, `order-page-client.tsx`, `order-review-table.tsx`, `order-confirm-modal.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · verify:sales-cover PASS (normalizer รวมแล้ว equivalent) · build ผ่าน
- **ไม่ทำ (ตั้งใจ):** number parser (`null` vs `0`, int vs float) และ date parser (DMY vs simple) มี semantic ต่างกันจริง — force-merge เสี่ยงกว่าได้ · comma-consistency แก้ที่ 3.2 แล้ว · `฿` ใน stock stat card (`stock-page-client`) เหลือไว้ (คนละ surface, low-pri)

### [x] 3.5 fetch ล้มเหลวเงียบ = ตารางว่าง → เพิ่ม error/retry state
- **แก้:** ทั้ง 3 query — `queryFn` throw เมื่อ `!res.ok` (react-query set `isError`) + เพิ่ม banner "ลองใหม่" (เรียก `refetch()`) แยกจากสถานะ "ไม่มีข้อมูล"
- **ไฟล์:** `stock-page-client.tsx`, `sales-orders-client.tsx`, `sales-notifications-client.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน · เป็น UI เพิ่ม (render เฉพาะตอน error) ไม่กระทบ happy path · (แสดงผลจริงตอน fetch fail — QA เมื่อเจอ error)

### [x] 3.6 MAX_DAYS_KEPT cutoff วัดจาก now → ใช้ latestDate (LATENT)
- `lib/fabric/sold-history.ts` คิด cutoff ถอยจาก `fileMaxDate` (วันล่าสุดในไฟล์) แทน `now`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · 8563 rows เท่าเดิม, lastDate 2026-07-13, window 30 ทำงาน · build ผ่าน

---

## Phase 4 — ฟีเจอร์แนะนำ (value/effort)

### [x] 4.1 แจ้งเตือนสต็อกวิกฤต (CVD < min & มีขาย) — badge + filter
- **ทำแล้ว:** `isCriticalStock` (stockCvd < minDays & avgSales > 0) + ปุ่ม toggle "สต็อกวิกฤต" (AlertTriangle สีแดง + count badge) ข้างปุ่ม "สินค้าใหม่" · กดกรองเฉพาะรายการวิกฤต · reset ตอน focus จากหน้า order · ไม่ต้อง API ใหม่
- **ไฟล์:** `components/stock/stock-page-client.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · e2e vda1: critical 149/804 (สมเหตุผล) predicate ถูก · build ผ่าน · server 200 · (badge/filter เป็น UI mirror ปุ่มสินค้าใหม่ที่มีอยู่ — visual QA เมื่อสะดวก)

### [ ] 4.2 Export CSV/Excel stock + order (ตอนนี้ไม่มี export) [สูง/ต่ำ]
- toolbar `stock-page-client.tsx`, `order-review-table.tsx`
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] 4.3 เก็บ flag/threshold ลง order + bulk อนุมัติที่ไม่แดง [สูง/กลาง] (ปิดบั๊ก 1.3)
- `app/api/orders/route.ts`, `order-review-table.tsx`
- **ผลตรวจสอบ:** _(รอทำ)_

### [ ] 4.4 แนวโน้ม 90 วัน + %WoW + moving average [กลาง-สูง/กลาง]
- `components/stock/product-sales-panel.tsx` ขยาย `DAY_OPTIONS`
- **ผลตรวจสอบ:** _(รอทำ)_

### [x] 4.5 Smart min/max แนะนำ (data-driven) บนหน้าจัดการร้าน
- **ทำแล้ว:** `suggestThreshold()` client-side (ใช้ rows ที่ manage โหลดอยู่แล้ว — ไม่ต้อง API ใหม่) · ดูสัดส่วนสินค้าใกล้หมด (critical) vs ค้างสต็อก (overstock) ต่อแบรนด์ → แนะนำเพิ่ม buffer / ลด · banner "แนะนำ X/Y วัน + เหตุผล" + ปุ่ม "ใช้ค่านี้" (PATCH section threshold) · clamp min[3,14] max[min+4,30]
- **ไฟล์:** `components/manage/manage-client.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · e2e vda1: 41/90 แบรนด์มี suggestion, 0 หลุด clamp · ทิศทางถูก (สบู่ฟลอเร่ critical 50%→9/18 · เบบี้บาธ overstock 71%→6/13) · build ผ่าน

### [ ] 4.6 Dashboard เซลส์ (pending, approval rate, ร้านแดงเยอะ) [กลาง/กลาง]
- view ใหม่ + `/api/orders` เดิม
- **ผลตรวจสอบ:** _(รอทำ)_

### [x] 4.7 Badge คำสั่งซื้อรอตรวจ บน nav (polling)
- **ทำแล้ว:** เพิ่ม query นับ `pending_approval` + `refetchInterval 60s` → badge บนแท็บ "คำสั่งซื้อ" (แท็บ "การแจ้งเตือน" มี badge อยู่แล้ว)
- **ไฟล์:** `components/sales/sales-nav.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน · server 200

### [x] 4.8 (ใหม่) Badge "โปรหมดใน X วัน" บนแถวสินค้า
- **ทำแล้ว:** `mapStockRow` คำนวณ `currentPromoEndsInDays` จาก `c4PromoRows` (active) โซนไทย + helper `daysBetweenIso` · `PromoDetailCell` โชว์ chip ⏰ เมื่อ ≤ 7 วัน (desktop + mobile)
- **ไฟล์:** `lib/repositories/stock-mapper.ts`, `lib/repositories/types.ts`, `lib/fabric/bkk-date.ts`, `components/promo/promo-detail-cell.tsx`, `components/stock/stock-page-client.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · e2e vda1: 409 rows คำนวณ endsInDays ได้, 0 ค่าติดลบ (ตอนนี้ยังไม่มีโปร ≤7วัน → chip ยังไม่โชว์ ถูกต้อง) · build ผ่าน

### [x] 4.9 (ใหม่) KPI "สต็อกวิกฤต" + stat tile กดกรองได้
- **ทำแล้ว:** เพิ่ม stat card "สต็อกวิกฤต" (แดง) ในแถบ KPI · ทำให้ tile "ควรสั่ง"/"สต็อกวิกฤต" กดเพื่อกรองตารางได้ (integrate กับ 4.1)
- **ไฟล์:** `components/stock/stock-page-client.tsx`
- **ผลตรวจสอบ:** ✅ 2026-07-14 · build ผ่าน (ต่อยอดจาก criticalCount ที่ verify แล้วใน 4.1)

---

## บันทึกการทำงาน (Changelog)
- 2026-07-14 — สร้างแผน + เริ่ม Phase 1
- 2026-07-14 — ✅ 1.1 ตัด fallback aggregateByDate (non-VDA ไม่เห็นยอดร้านอื่น) + ✅ 1.2 resolveAvgSales fallback L30 เมื่อ L7=0 · build + verify:sales-cover ผ่าน
- 2026-07-14 — ✅ 1.4 แก้ timezone โปร/ราคา (สร้าง `lib/fabric/bkk-date.ts`) + ✅ 1.5 backdate createdAt ตอน bulk import ครั้งแรก · build ผ่าน
- 2026-07-14 — ✅ 1.3 เก็บ min/max ลง OrderItem (migration additive) เซลส์เห็นสีธงตรงกับร้าน · e2e verify ผ่าน · **🎉 Phase 1 correctness เสร็จครบ 5/5**
- 2026-07-14 — ✅ 2.1 preload masters ตอน boot + robust ensureFabricMastersFresh · request แรกจาก 2,852ms → 0ms · เริ่ม Phase 2
- 2026-07-14 — ✅ 2.3+2.4 ensureSkus Map O(1) + $transaction batch · ✅ 2.2 parseCsv single-pass + streamCsvFile (sku-master 109576/38322 เท่าเดิม) · ✅ 2.5 per-store cache invalidation (ไม่ล้าง cache ข้ามร้าน) · ✅ 2.6 content-visibility มือถือ
- 2026-07-14 — ✅ 2.7 ResizeObserver วัดความสูงแถวที่กางออก (visual QA ผู้ใช้ผ่าน) · **🎉 Phase 2 เสร็จครบ 7/7**
- 2026-07-14 — ✅ Phase 3 ครบ 6/6: 3.2 comma parse · 3.6 cutoff จาก latestDate · 3.4 รวม store-key + formatBaht · 3.1 react-query cache · 3.5 error/retry states · 3.3 popup self-describing · build + verify:sales-cover PASS · **🎉 Phase 3 เสร็จ**
- 2026-07-14 — ✅ 4.1 แจ้งเตือนสต็อกวิกฤต (badge + filter, critical 149/804 บน vda1) · build + server 200
- 2026-07-14 — ✅ ชุดฟีเจอร์: 4.7 badge คำสั่งซื้อรอตรวจ · 4.9 KPI สต็อกวิกฤต + tile กดกรอง · 4.8 badge โปรหมดใน Xวัน · 4.5 smart min/max หน้าจัดการ · build + verify:sales-cover PASS · ไม่มีไฟล์ temp · server 200
- 2026-07-14 — ✅ เก็บกวาด lint (ลบ import ที่ไม่ใช้ + wrap series ใน useMemo) → **No ESLint warnings or errors** · ✅ **visual QA โดยผู้ใช้: ทุกฟีเจอร์ UI (B/C/E/A) โชว์ถูกต้อง**
