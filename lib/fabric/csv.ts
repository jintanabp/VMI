import fs from "fs";

/** ตัวคั่นที่รองรับ — ดูจากบรรทัดหัวตารางเท่านั้น ไม่เดาใหม่รายแถว */
export type CsvSeparator = "," | "\t" | ";" | "|";

/**
 * เดาตัวคั่นจากบรรทัดหัวตาราง
 *
 * นับเฉพาะตัวที่อยู่นอกเครื่องหมายคำพูด ไม่งั้นหัวคอลัมน์อย่าง "ชื่อ, นามสกุล"
 * จะทำให้เดาผิดทั้งไฟล์ · เสมอกันให้ comma ชนะ (ไฟล์ทุกใบที่ระบบดึงมาเป็น comma)
 */
export function sniffSeparator(headerRecord: string): CsvSeparator {
  const counts: Record<CsvSeparator, number> = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  let inQuotes = false;

  for (let i = 0; i < headerRecord.length; i++) {
    const ch = headerRecord[i];
    if (ch === '"') {
      if (inQuotes && headerRecord[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === "," || ch === "\t" || ch === ";" || ch === "|") {
      counts[ch as CsvSeparator]++;
    }
  }

  if (counts["\t"] > 0) return "\t";
  let best: CsvSeparator = ",";
  for (const sep of [";", "|"] as const) {
    if (counts[sep] > counts[best]) best = sep;
  }
  return best;
}

/**
 * วน record ทีละอันแบบ single-pass — **รู้จักเครื่องหมายคำพูด**
 *
 * เดิมชื่อ forEachCsvLine และตัดที่ \n/\r ดื้อ ๆ โดยไม่สนใจว่าอยู่ในคำพูดหรือไม่
 * ค่าที่มี newline อยู่ข้างในจึงถูกฉีกเป็นหลายแถว
 *
 * พฤติกรรมที่คงไว้เหมือนเดิมทุกอย่าง: ข้าม BOM ที่ต้นไฟล์ · รองรับทั้ง \n, \r\n และ \r
 * เดี่ยว · ข้าม record ว่าง (บรรทัดว่างและ newline ปิดท้ายไฟล์จึงไม่กลายเป็นแถวผี)
 *
 * นิยามของคำพูดต้องตรงกับ parseCsvRecord เป๊ะ ไม่งั้นขอบเขต record กับการแยกเซลล์
 * จะมองไฟล์คนละแบบ — ดู isClosingQuote()
 */
export function forEachCsvRecord(
  text: string,
  onRecord: (record: string) => void
): void {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0; // ข้าม BOM
  forEachCsvRecordWith(text, sniffSeparator(firstLineOf(text, start)), start, onRecord);
}

/**
 * เหมือน forEachCsvRecord แต่บอกตัวคั่นและจุดเริ่มเองได้
 *
 * csv-page-reader ใช้ตัวนี้กับ "ก้อนกลางไฟล์" ที่ตัดมาอ่านทีละหน้า — ก้อนนั้นไม่มี BOM
 * ให้ข้าม และเดาตัวคั่นจากตัวเองไม่ได้ (บรรทัดแรกของก้อนไม่ใช่หัวตาราง)
 */
export function forEachCsvRecordWith(
  text: string,
  sep: string,
  start: number,
  onRecord: (record: string) => void
): void {
  const len = text.length;
  let recordStart = start;
  let inQuotes = false;

  for (let i = start; i <= len; i++) {
    if (i === len) {
      if (i > recordStart) onRecord(text.slice(recordStart, i));
      break;
    }

    const ch = text[i];
    if (ch === '"') {
      if (!inQuotes) {
        inQuotes = true;
      } else if (text[i + 1] === '"') {
        i++; // "" = quote ตัวอักษร
      } else if (isClosingQuote(text[i + 1], sep)) {
        inQuotes = false;
      }
      // ไม่เข้าเงื่อนไขไหนเลย = quote เดี่ยวกลางค่า (นิ้ว) — ปล่อยผ่าน ยังอยู่ในคำพูด
      continue;
    }
    if (inQuotes) continue;

    if (ch === "\n" || ch === "\r") {
      if (i > recordStart) onRecord(text.slice(recordStart, i));
      if (ch === "\r" && text[i + 1] === "\n") i++;
      recordStart = i + 1;
    }
  }
}

/** ข้อความจนถึงตัวขึ้นบรรทัดใหม่ตัวแรก — ใช้เดาตัวคั่นก่อนเริ่มตัด record */
function firstLineOf(text: string, start: number): string {
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n" || ch === "\r") return text.slice(start, i);
  }
  return text.slice(start);
}

/**
 * `"` ปิดค่าจริงหรือเป็นแค่ตัวอักษรกลางค่า
 *
 * ต้นทางไม่ได้ escape เครื่องหมายนิ้วให้: `"R80522 - เทปสีใส2"x50y"` ควรอ่านได้เป็น
 * ค่าเดียว แต่ถ้าถือว่า `"` ตัวกลางปิดค่า สถานะคำพูดจะพลิกไปทั้งบรรทัด แล้วพอจบบรรทัด
 * ยังค้างว่า "อยู่ในคำพูด" ตัวตัด record จะกลืนบรรทัดถัดไปยาวเป็นพันแถว
 * (เคยเกิดจริง: record เดียว 98,196 ตัวอักษร กลืนสินค้าไป 15 รหัส)
 *
 * กติกามาตรฐานคือ `"` ปิดค่าได้ก็ต่อเมื่อตัวถัดไปเป็นตัวคั่น ขึ้นบรรทัดใหม่ หรือจบข้อความ
 * นอกนั้นถือเป็นตัวอักษรธรรมดา
 */
function isClosingQuote(next: string | undefined, sep: string): boolean {
  return next === undefined || next === sep || next === "\n" || next === "\r";
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  let headers: string[] = [];
  let sep: string = ",";
  const rows: Record<string, string>[] = [];

  forEachCsvRecord(text, (record) => {
    if (headers.length === 0) {
      sep = sniffSeparator(record);
      headers = parseCsvRecord(record, sep);
      return;
    }
    const values = parseCsvRecord(record, sep);
    const row: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      row[headers[h]] = (values[h] ?? "").trim();
    }
    rows.push(row);
  });

  return { headers, rows };
}

/** อ่าน CSV แบบ stream: เรียก onRow ต่อแถวโดยไม่เก็บ array ของทุกแถว
 *  คีย์ของ record ถูก lower-case + trim ให้แล้ว (ผู้ใช้ไม่ต้อง normKeys ซ้ำ)
 *  เหมาะกับไฟล์ใหญ่ (เช่น sku_master 69MB) เพื่อลด RAM/GC
 *
 *  หมายเหตุ: ยังอ่านทั้งไฟล์เข้า string อยู่ — ที่ประหยัดคือ array ของแถว
 *  ถ้าต้องการอ่านแบบไม่โหลดทั้งไฟล์ ใช้ lib/fabric/csv-page-reader.ts */
export function streamCsvFile(
  filePath: string,
  onRow: (row: Record<string, string>) => void
): { headers: string[]; rowCount: number } {
  const text = fs.readFileSync(filePath, "utf-8");
  let headers: string[] = [];
  let sep: string = ",";
  let rowCount = 0;

  forEachCsvRecord(text, (record) => {
    if (headers.length === 0) {
      sep = sniffSeparator(record);
      headers = parseCsvRecord(record, sep).map((h) => h.toLowerCase().trim());
      return;
    }
    const values = parseCsvRecord(record, sep);
    const row: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      row[headers[h]] = (values[h] ?? "").trim();
    }
    onRow(row);
    rowCount++;
  });

  return { headers, rowCount };
}

/**
 * แยก record หนึ่งอันเป็นเซลล์ — รองรับตัวคั่นและ newline ที่อยู่ในคำพูด
 * รวมทั้ง `""` ที่แปลว่า quote ตัวอักษร (เดิมชื่อ parseCsvLine ไม่ได้ export)
 */
export function parseCsvRecord(record: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (ch === '"') {
      if (!inQuotes) {
        inQuotes = true;
      } else if (record[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (isClosingQuote(record[i + 1], sep)) {
        inQuotes = false;
      } else {
        // quote เดี่ยวกลางค่า (เครื่องหมายนิ้ว) — เก็บเป็นตัวอักษร ไม่ปิดค่า
        cur += ch;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function readCsvFile(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = fs.readFileSync(filePath, "utf-8");
  return parseCsv(text);
}

export function validateCsvColumns(
  filePath: string,
  required: string[],
  minRows: number
): { rowCount: number; missing: string[] } {
  const { headers, rows } = readCsvFile(filePath);
  const present = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = required.filter((c) => !present.has(c.trim().toLowerCase()));
  const rowCount = rows.length;

  if (minRows > 0 && rowCount < minRows) {
    missing.push(`too_few_rows (got ${rowCount}, need ≥${minRows})`);
  }

  return { rowCount, missing };
}
