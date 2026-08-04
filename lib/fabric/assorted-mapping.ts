import fs from "fs";
import { readCsvFile } from "./csv";

/**
 * ชื่อกลุ่มโปรโมชั่น (cft_assorted_mapping.csv)
 *
 * ตาราง C4 มีแต่รหัสกลุ่ม `ASSORTEDPRODUCTGROUP` (เช่น PJ2.7SUPER) ซึ่งร้านค้าอ่านไม่ออก
 * ไฟล์นี้คือ mapping รหัส → `DESCRIPTIONASSORTED` ("เปาซุปเปอร์2700G(ไวท์,ซอฟท์,คัลเลอร์)")
 * ทีมมาร์เก็ตติ้งอัปเดตเรื่อย ๆ จึง sync มาพร้อม master ตัวอื่นทุกรอบ
 *
 * สองเรื่องที่ไฟล์จริงมีและต้องรับมือ:
 *   - ~65 กลุ่มมี DESCRIPTIONASSORTED ว่าง → ต้อง fallback เป็นรหัสกลุ่มเดิม
 *   - บางรหัสมีหลายแถวและคำอธิบายไม่ตรงกัน → ยึดแถวที่ UpdateDate ใหม่สุด
 */
const KEY_COLUMN = "ASSORTEDPRODUCTGROUP";
const NAME_COLUMN = "DESCRIPTIONASSORTED";

export const ASSORTED_MAPPING_REQUIRED_COLUMNS = [
  KEY_COLUMN,
  NAME_COLUMN,
] as const;

export class AssortedMapping {
  private byGroup = new Map<string, string>();
  private csvPath: string | null = null;
  private lastError: string | null = null;

  get isLoaded() {
    return this.byGroup.size > 0;
  }

  get size() {
    return this.byGroup.size;
  }

  /** null = ปกติ — ใช้บอกหน้าแอดมินว่าทำไมยังเห็นแต่รหัสกลุ่ม */
  get loadError(): string | null {
    return this.lastError;
  }

  /** ชื่อกลุ่ม — "" เมื่อไม่รู้จักรหัสนี้หรือคำอธิบายว่าง (ผู้เรียก fallback เป็นรหัสเอง) */
  nameFor(group?: string | null): string {
    const key = group?.trim();
    if (!key) return "";
    return this.byGroup.get(key) ?? this.byGroup.get(key.toUpperCase()) ?? "";
  }

  /** ข้อความที่เอาไปแสดงได้เลย — ชื่อถ้ามี ไม่งั้นรหัสกลุ่มเดิม */
  labelFor(group?: string | null): string {
    const key = group?.trim() ?? "";
    return this.nameFor(key) || key;
  }

  /** ส่งทั้งชุดให้ client (447 กลุ่ม ~40KB) — เฉพาะกลุ่มที่มีชื่อจริง */
  toRecord(): Record<string, string> {
    return Object.fromEntries(this.byGroup);
  }

  private fail(message: string): void {
    this.lastError = message;
    this.byGroup = new Map();
    console.error(`[AssortedMapping] ${message}`);
  }

  load(csvPath: string): void {
    this.lastError = null;
    this.csvPath = csvPath;

    if (!fs.existsSync(csvPath)) {
      // ไม่ใช่ error ร้ายแรง — ระบบยังทำงานได้ด้วยรหัสกลุ่มเดิม
      this.fail(`ไม่พบไฟล์ชื่อกลุ่มโปร: ${csvPath}`);
      return;
    }

    const { headers, rows } = readCsvFile(csvPath);
    const headerSet = new Set(headers.map((h) => h.trim().toUpperCase()));
    const missing = ASSORTED_MAPPING_REQUIRED_COLUMNS.filter(
      (c) => !headerSet.has(c)
    );
    if (missing.length > 0) {
      this.fail(
        `คอลัมน์ที่จำเป็นหายไป [${missing.join(", ")}] ใน ${csvPath} — ` +
          `header ที่พบ: ${headers.map((h) => h.trim()).join(", ")}`
      );
      return;
    }

    const byGroup = new Map<string, string>();
    const updatedAt = new Map<string, string>();
    let conflicts = 0;
    let blank = 0;

    for (const row of rows) {
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        norm[k.trim().toUpperCase()] = (v ?? "").trim();
      }
      const group = norm[KEY_COLUMN];
      if (!group) continue;

      const name = norm[NAME_COLUMN];
      if (!name) {
        if (!byGroup.has(group)) blank++;
        continue;
      }

      const stamp = norm.UPDATEDATE ?? "";
      const prev = byGroup.get(group);
      if (prev !== undefined) {
        if (prev !== name) conflicts++;
        // แถวเดิมใหม่กว่า (หรือเท่ากัน) → คงไว้ ให้ผลลัพธ์คงที่ทุกรอบโหลด
        if ((updatedAt.get(group) ?? "") >= stamp) continue;
      }
      byGroup.set(group, name);
      updatedAt.set(group, stamp);
    }

    if (rows.length > 0 && byGroup.size === 0) {
      this.fail(
        `อ่านไฟล์ได้ ${rows.length} แถว แต่ไม่มีชื่อกลุ่มสักตัวจาก ${csvPath} — ` +
          `ตรวจว่า ${KEY_COLUMN} / ${NAME_COLUMN} มีค่าจริงหรือไม่`
      );
      return;
    }

    this.byGroup = byGroup;
    console.info(
      `[AssortedMapping] Loaded ${byGroup.size} groups from ${csvPath}` +
        (blank > 0 ? ` (${blank} กลุ่มไม่มีคำอธิบาย — ใช้รหัสกลุ่มแทน)` : "") +
        (conflicts > 0 ? ` (${conflicts} แถวชนกัน — ยึด UpdateDate ล่าสุด)` : "")
    );
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }
}
