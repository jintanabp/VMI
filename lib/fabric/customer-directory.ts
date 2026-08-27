import fs from "fs";
import { readCsvFile } from "./csv";

const NON_DIGIT = /\D+/g;

export interface CustomerRecord {
  code: string;
  name: string;
  nameThai: string;
  nameEnglish: string;
  displayName: string;
  address: string;
  area: string;
  province: string;
  amphur: string;
  district: string;
  cusGroup: string;
  taxId: string;
}

interface InternalCustomer extends CustomerRecord {
  search: string;
  taxDigits: string;
  nameThaiLower: string;
  nameEnglishLower: string;
  provinceLower: string;
}

function normRow(row: Record<string, string>): InternalCustomer | null {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    norm[k.toLowerCase().trim()] = (v ?? "").trim();
  }

  const code =
    norm.customercode || norm.code || norm.customer_code || "";
  if (!code || code === "0") return null;

  const nameThai = norm.customer_namethai || "";
  const nameEnglish = norm.customer_nameenglish || "";
  const name =
    nameThai ||
    nameEnglish ||
    norm.name ||
    norm.customer_name ||
    "";
  const displayName =
    norm.customercode_name ||
    (code && name ? `${code} — ${name}` : code || name);
  const address =
    norm.addressname || norm.address || norm.customer_address || "";
  const area =
    norm.area_nameenglish || norm.area_namethai || norm.area || "";
  // จังหวัด/อำเภอ/ตำบล — เดิมไม่ได้อ่านมาเลย ทั้งที่ dim_customer มีให้ครบ
  // ผลคือค้นด้วย "สงขลา" ไม่เจออะไรเลย ซึ่งเป็นวิธีที่คนจำคลังได้จริงมากกว่าจำรหัส
  const province = norm.province_namethai || norm.province || "";
  const amphur = norm.amphur_namethai || norm.amphur || "";
  const district = norm.district_namethai || norm.district || "";
  const cusGroup = norm.cusgroup || norm.customergroup || "";
  const taxId = norm.taxid || norm.tax_id || "";
  const search = [
    code,
    nameThai,
    nameEnglish,
    taxId,
    displayName,
    address,
    area,
    province,
    amphur,
    district,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const taxDigits = taxId.replace(NON_DIGIT, "");

  return {
    code,
    name,
    nameThai,
    nameEnglish,
    displayName,
    address,
    area,
    province,
    amphur,
    district,
    cusGroup,
    taxId,
    search,
    taxDigits,
    nameThaiLower: nameThai.toLowerCase(),
    nameEnglishLower: nameEnglish.toLowerCase(),
    provinceLower: province.toLowerCase(),
  };
}

function toPublic(c: InternalCustomer): CustomerRecord {
  return {
    code: c.code,
    name: c.name,
    nameThai: c.nameThai,
    nameEnglish: c.nameEnglish,
    displayName: c.displayName,
    address: c.address,
    area: c.area,
    province: c.province,
    amphur: c.amphur,
    district: c.district,
    cusGroup: c.cusGroup,
    taxId: c.taxId,
  };
}

/** จำนวนสูงสุดที่เก็บไว้จัดอันดับ — เกินกว่านี้แปลว่าคำค้นกว้างเกินจะเลือกอยู่ดี */
const RANK_POOL = 500;

/**
 * คะแนนยิ่งน้อยยิ่งตรง · -1 = ไม่เข้าเงื่อนไข
 *
 * ลำดับนี้มาจากวิธีที่คนค้นจริง: รู้รหัสก็พิมพ์รหัส · รู้แค่ชื่อบริษัทก็พิมพ์ชื่อ ·
 * จำได้แต่ว่าอยู่จังหวัดไหนก็พิมพ์จังหวัด
 */
function scoreCustomer(
  c: InternalCustomer,
  qLower: string,
  qDigits: string
): number {
  const code = c.code.toLowerCase();
  if (code === qLower) return 0;
  if (code.startsWith(qLower)) return 1;

  if (qDigits.length >= 9 && c.taxDigits && c.taxDigits === qDigits) return 2;
  if (qDigits.length >= 4 && c.taxDigits && c.taxDigits.includes(qDigits)) return 3;

  if (c.nameThaiLower.startsWith(qLower) || c.nameEnglishLower.startsWith(qLower)) {
    return 4;
  }
  // จังหวัดตรงเป๊ะ มาก่อน "ชื่อมีคำนี้อยู่กลาง ๆ" — คนพิมพ์ชื่อจังหวัดคือกำลังหาด้วยพื้นที่
  // เคสจริง: ค้น "สงขลา" แล้วได้ร้านที่ จ.ปัตตานี ขึ้นก่อน เพราะชื่อมีคำว่า
  // "มหาวิทยาลัยสงขลานครินทร์" อยู่ ทั้งที่ลูกค้าใน จ.สงขลา จริง ๆ มีอยู่
  if (c.provinceLower === qLower) return 5;
  if (c.nameThaiLower.includes(qLower) || c.nameEnglishLower.includes(qLower)) {
    return 6;
  }
  if (c.search.includes(qLower)) return 7;

  return -1;
}

export class CustomerDirectory {
  private customers: InternalCustomer[] = [];
  private byCode = new Map<string, InternalCustomer>();
  private csvPath: string | null = null;

  constructor(csvPath?: string | null) {
    if (csvPath) this.load(csvPath);
  }

  load(csvPath: string): void {
    if (!fs.existsSync(csvPath)) {
      console.warn(`[CustomerDirectory] CSV not found: ${csvPath}`);
      this.customers = [];
      this.byCode.clear();
      this.csvPath = csvPath;
      return;
    }

    const { rows } = readCsvFile(csvPath);
    const loaded: InternalCustomer[] = [];
    const byCode = new Map<string, InternalCustomer>();

    for (const row of rows) {
      const c = normRow(row);
      if (!c) continue;
      loaded.push(c);
      byCode.set(c.code, c);
    }

    this.customers = loaded;
    this.byCode = byCode;
    this.csvPath = csvPath;
    console.info(`[CustomerDirectory] Loaded ${loaded.length} customers from ${csvPath}`);
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }

  get size() {
    return this.customers.length;
  }

  get isLoaded() {
    return this.customers.length > 0;
  }

  getByCode(code: string): CustomerRecord | null {
    const c = this.byCode.get(code);
    return c ? toPublic(c) : null;
  }

  search(q: string, limit = 50): CustomerRecord[] {
    return this.searchRanked(q, limit).hits;
  }

  /**
   * ค้นลูกค้าแบบจัดอันดับ + บอกจำนวนที่เจอทั้งหมด
   *
   * ใช้ตอนแอดมินเพิ่มคลัง VDA ใหม่แล้วไม่รู้ว่ารหัสลูกค้าคือเลขอะไร — ไม่มีไฟล์ไหนใน
   * ระบบบอกได้ว่า "vda6 คือบริษัทอะไร" (ชื่อใน dim_customer เป็นชื่อบริษัท ไม่มีคำว่า VDA
   * สักราย) คนที่รู้ว่าเป็นบริษัทไหนจึงต้องค้นด้วยชื่อ/จังหวัด/เลขผู้เสียภาษีเอาเอง
   *
   * ของเดิมคืน 50 ตัวแรกตามลำดับในไฟล์ รหัสที่ตรงเป๊ะเลยไปจมอยู่ท้ายผลลัพธ์ ·
   * total สำคัญพอ ๆ กับตัวผลลัพธ์: ทำให้บอกได้ว่า "แสดง 20 จาก 137" แทนที่จะปล่อยให้
   * เข้าใจว่ามีอยู่แค่ 20 ราย
   */
  searchRanked(
    q: string,
    limit = 20
  ): { hits: CustomerRecord[]; total: number; capped: boolean } {
    const needle = q.trim();
    if (!needle) return { hits: [], total: 0, capped: false };

    const qLower = needle.toLowerCase();
    const qDigits = needle.replace(NON_DIGIT, "");
    const scored: { c: InternalCustomer; score: number }[] = [];
    let total = 0;

    for (const c of this.customers) {
      const score = scoreCustomer(c, qLower, qDigits);
      if (score < 0) continue;
      total++;
      if (scored.length < RANK_POOL) scored.push({ c, score });
    }

    scored.sort(
      (a, b) =>
        a.score - b.score ||
        a.c.code.localeCompare(b.c.code, undefined, { numeric: true })
    );

    return {
      hits: scored.slice(0, limit).map((s) => toPublic(s.c)),
      total,
      capped: total > RANK_POOL,
    };
  }

  listAll(limit = 500): CustomerRecord[] {
    return this.customers.slice(0, limit).map(toPublic);
  }
}
