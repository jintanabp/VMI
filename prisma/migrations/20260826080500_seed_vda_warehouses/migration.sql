-- ทะเบียนคลัง VDA ชุดที่ใช้งานอยู่จริง ณ 26 ส.ค. 2026
--
-- ใส่เป็น data migration ไม่ใช่ค่าใน .env: ความรู้ว่า "vda1 คือลูกค้ารหัสไหน" ต้องมีติด
-- ระบบมาตั้งแต่ deploy แรก ไม่งั้นยอดขายรายวันกับสิทธิ์ของเซลล์จะว่างจนกว่าจะมีคนไปกรอก
-- INSERT OR IGNORE = รันซ้ำได้ และไม่ทับของที่แอดมินแก้ไว้แล้วในหน้า /admin/vda
INSERT OR IGNORE INTO "VdaWarehouse" ("code", "customerCodes", "label", "active", "updatedAt") VALUES
  ('vda1', '3231847', '', true, CURRENT_TIMESTAMP),
  ('vda2', '5042814', '', true, CURRENT_TIMESTAMP),
  ('vda3', '0025409', '', true, CURRENT_TIMESTAMP),
  ('vda4', '3184635', '', true, CURRENT_TIMESTAMP),
  ('vda5', '6082417', '', true, CURRENT_TIMESTAMP);
