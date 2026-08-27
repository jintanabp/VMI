import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCsvRecord } from "@/lib/fabric/csv";
import {
  MAX_CELL_CHARS,
  __resetCsvIndexCacheForTest,
  countCsvRecords,
  getCsvIndex,
  readCsvHead,
  readCsvPage,
  searchCsv,
} from "@/lib/fabric/csv-page-reader";

/**
 * ตัวอ่าน CSV ทีละหน้า — ตัวเลขแถวที่หน้าแอดมินโชว์ต้องเป็นเลขเดียวกับที่ระบบใช้จริง
 * ดัชนีสแกนระดับ byte ส่วน loader อ่านเป็น string ถ้าสองทางนับไม่ตรงกันแปลว่าพัง
 */

const tmpDirs: string[] = [];

function writeCsv(content: string, name = "sample.csv"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-csvpage-"));
  tmpDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, "utf-8");
  return file;
}

/** 20 แถว: A0..A19 */
function twentyRows(): string {
  const lines = ["code,name"];
  for (let i = 0; i < 20; i++) lines.push(`A${i},ชื่อ${i}`);
  return lines.join("\n") + "\n";
}

beforeEach(() => {
  __resetCsvIndexCacheForTest();
});

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("getCsvIndex", () => {
  it("นับแถวข้อมูลโดยไม่นับหัวตาราง และเก็บหัวตารางดิบไว้", () => {
    const file = writeCsv("ProductCode,Name\n001,ก\n002,ข\n");
    const idx = getCsvIndex(file);
    expect(idx.rowCount).toBe(2);
    expect(idx.headers).toEqual(["ProductCode", "Name"]);
  });

  it("รองรับ CRLF และ BOM พร้อมกัน", () => {
    const file = writeCsv("﻿code,name\r\nA,ก\r\nB,ข\r\n");
    const idx = getCsvIndex(file);
    expect(idx.bomBytes).toBe(3);
    expect(idx.rowCount).toBe(2);
    expect(idx.headers).toEqual(["code", "name"]);
    expect(readCsvPage(file, { offset: 0, limit: 10 }).rows[0].cells).toEqual(["A", "ก"]);
  });

  it("newline ในเครื่องหมายคำพูดนับเป็นแถวเดียว และตั้งธง hasEmbeddedNewlines", () => {
    const file = writeCsv('code,name\n"A","บน\nล่าง"\n"B","ปกติ"\n');
    const idx = getCsvIndex(file);
    expect(idx.rowCount).toBe(2);
    expect(idx.hasEmbeddedNewlines).toBe(true);
    expect(readCsvPage(file, { offset: 0, limit: 5 }).rows[0].cells[1]).toBe("บน\nล่าง");
  });

  it("เครื่องหมายนิ้วที่ไม่ได้ escape ต้องไม่กลืนแถวถัดไป", () => {
    // เคสจริงจาก item_barcode_map_v2.csv ที่เคยทำให้ record เดียวยาว 98,196 ตัวอักษร
    const file = writeCsv('code,name\n"R80522","เทปสีใส2"x50y"\n"949016","บางจาก"\n');
    const idx = getCsvIndex(file);
    expect(idx.rowCount).toBe(2);
    expect(idx.hasEmbeddedNewlines).toBe(false);
    const rows = readCsvPage(file, { offset: 0, limit: 5 }).rows;
    expect(rows[0].cells[1]).toBe('เทปสีใส2"x50y');
    expect(rows[1].cells[0]).toBe("949016");
  });

  it("ไฟล์คั่นด้วย tab", () => {
    const file = writeCsv("code\tname\nA\tก\n", "tabbed.csv");
    const idx = getCsvIndex(file);
    expect(idx.separator).toBe("\t");
    expect(idx.headers).toEqual(["code", "name"]);
  });

  it("แถวที่คอลัมน์ไม่เท่าหัวตาราง ถูกรายงานเป็น ragged พร้อมจำนวนคอลัมน์สูงสุด", () => {
    const file = writeCsv("a,b,c\n1,2\n1,2,3,4\n");
    const idx = getCsvIndex(file);
    expect(idx.ragged).toBe(true);
    expect(idx.maxColumns).toBe(4);
  });

  it("หัวตารางชื่อซ้ำต้องอยู่ครบทั้งคู่ ไม่ถูกยุบ", () => {
    const file = writeCsv("code,name,name\nA,ก,ข\n");
    const idx = getCsvIndex(file);
    expect(idx.headers).toEqual(["code", "name", "name"]);
    expect(readCsvPage(file, { offset: 0, limit: 1 }).rows[0].cells).toEqual(["A", "ก", "ข"]);
  });

  it("ไฟล์ว่างและไฟล์ที่มีแต่หัวตาราง = 0 แถว", () => {
    expect(getCsvIndex(writeCsv("")).rowCount).toBe(0);
    const headerOnly = getCsvIndex(writeCsv("a,b,c\n"));
    expect(headerOnly.rowCount).toBe(0);
    expect(headerOnly.headers).toEqual(["a", "b", "c"]);
  });

  it("บรรทัดว่างกลางไฟล์ไม่กลายเป็นแถวผี", () => {
    const file = writeCsv("code\nA\n\nB\n");
    expect(getCsvIndex(file).rowCount).toBe(2);
  });

  it("ไฟล์เปลี่ยน = ทำดัชนีใหม่ ไม่ใช้ของเก่าค้าง", () => {
    const file = writeCsv("code\nA\nB\n");
    expect(countCsvRecords(file)).toBe(2);
    const before = getCsvIndex(file).version;

    fs.writeFileSync(file, "code\nA\nB\nC\nD\n", "utf-8");
    expect(countCsvRecords(file)).toBe(4);
    expect(getCsvIndex(file).version).not.toBe(before);
  });
});

describe("readCsvPage", () => {
  it("อ่านทีละหน้าข้าม anchor แล้วต่อกลับ ต้องได้เท่ากับอ่านรวดเดียว", () => {
    const file = writeCsv(twentyRows());
    const whole = readCsvPage(file, { offset: 0, limit: 200, stride: 3 }).rows;
    expect(whole).toHaveLength(20);

    const paged: string[][] = [];
    for (let off = 0; off < 20; off += 7) {
      paged.push(
        ...readCsvPage(file, { offset: off, limit: 7, stride: 3 }).rows.map((r) => r.cells)
      );
    }
    expect(paged).toEqual(whole.map((r) => r.cells));
  });

  it("เลขแถวที่คืนมาเป็นลำดับจริงในไฟล์ ไม่ใช่ลำดับในหน้า", () => {
    const file = writeCsv(twentyRows());
    const page = readCsvPage(file, { offset: 12, limit: 4, stride: 3 });
    expect(page.rows.map((r) => r.i)).toEqual([12, 13, 14, 15]);
    expect(page.rows[0].cells[0]).toBe("A12");
  });

  it("ขอเกินจำนวนแถวที่มี = ไม่มีแถว แต่ยังบอกจำนวนแถวรวมได้", () => {
    const file = writeCsv(twentyRows());
    const page = readCsvPage(file, { offset: 50, limit: 10 });
    expect(page.rows).toEqual([]);
    expect(page.index.rowCount).toBe(20);
  });

  it("เซลล์ยาวเกินเพดานถูกตัดพร้อมนับจำนวนที่ตัด", () => {
    const long = "ก".repeat(MAX_CELL_CHARS + 500);
    const file = writeCsv(`code,note\nA,${long}\n`);
    const page = readCsvPage(file, { offset: 0, limit: 1 });
    expect(page.truncatedCells).toBe(1);
    expect(page.rows[0].cells[1].length).toBe(MAX_CELL_CHARS + 1); // +1 = "…"
  });

  it("ข้อความไทยข้ามขอบก้อนอ่านต้องไม่เพี้ยน", () => {
    const lines = ["code,name"];
    for (let i = 0; i < 400; i++) lines.push(`A${i},ทดสอบภาษาไทยยาว ๆ ${i} กิโลกรัม`);
    const file = writeCsv(lines.join("\n") + "\n");
    const page = readCsvPage(file, { offset: 399, limit: 1, stride: 4 });
    expect(page.rows[0].cells[1]).toBe("ทดสอบภาษาไทยยาว ๆ 399 กิโลกรัม");
  });
});

describe("searchCsv", () => {
  it("ค้นเจอทุกคอลัมน์และบอกว่าค้นครบไฟล์", () => {
    const file = writeCsv(twentyRows());
    const res = searchCsv(file, { q: "ชื่อ7", limit: 50 });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].cells[0]).toBe("A7");
    expect(res.search?.complete).toBe(true);
  });

  it("จำกัดคอลัมน์ได้", () => {
    const file = writeCsv("code,name\nA1,B1\nB1,A1\n");
    const res = searchCsv(file, { q: "B1", limit: 50, column: 0 });
    expect(res.rows.map((r) => r.cells[0])).toEqual(["B1"]);
  });

  it("หยุดเพราะครบจำนวนที่แสดง ต้องไม่ถูกรายงานว่าหมดเวลา", () => {
    // ข้อความบนหน้าจอเคยโทษว่า "ใช้เวลาเกินกำหนด" ทั้งที่หยุดเพราะเจอครบ 100 แถวแล้ว
    const lines = ["code,name"];
    for (let i = 0; i < 50; i++) lines.push(`A${i},ซ้ำกันหมด`);
    const file = writeCsv(lines.join("\n") + "\n");
    const res = searchCsv(file, { q: "ซ้ำกันหมด", limit: 5 });
    expect(res.rows).toHaveLength(5);
    expect(res.search?.reason).toBe("limit");
    expect(res.search?.complete).toBe(false);
  });

  it("เจอครบทั้งไฟล์พอดี = complete ไม่ใช่ limit", () => {
    const lines = ["code,name"];
    for (let i = 0; i < 5; i++) lines.push(`A${i},ซ้ำกันหมด`);
    const file = writeCsv(lines.join("\n") + "\n");
    const res = searchCsv(file, { q: "ซ้ำกันหมด", limit: 5 });
    expect(res.search?.reason).toBe("complete");
    expect(res.search?.complete).toBe(true);
  });

  it("หมดเวลาแล้วต้องบอกว่าค้นไม่ครบ ไม่ใช่เงียบ ๆ ว่าไม่พบ", () => {
    const lines = ["code,name"];
    for (let i = 0; i < 5000; i++) lines.push(`A${i},ชื่อ${i}`);
    const file = writeCsv(lines.join("\n") + "\n");
    const res = searchCsv(file, { q: "ไม่มีทางเจอคำนี้", limit: 50, budgetMs: 0 });
    expect(res.rows).toEqual([]);
    expect(res.search?.complete).toBe(false);
    expect(res.search?.reason).toBe("timeout");
  });

  it("คำค้นว่าง = ไม่ค้น", () => {
    const file = writeCsv(twentyRows());
    expect(searchCsv(file, { q: "  ".trim(), limit: 10 }).rows).toEqual([]);
  });
});

describe("readCsvHead", () => {
  it("ได้หัวตารางกับตัวอย่างแถวโดยไม่ต้องสแกนทั้งไฟล์", () => {
    const file = writeCsv(twentyRows());
    const head = readCsvHead(file);
    expect(head.headers).toEqual(["code", "name"]);
    expect(head.separator).toBe(",");
    expect(head.sampleRows[0]).toEqual(["A0", "ชื่อ0"]);
  });

  it("อ่านมาไม่ครบไฟล์ ต้องไม่คืนแถวสุดท้ายที่ถูกตัดกลางคัน", () => {
    const file = writeCsv(twentyRows());
    const head = readCsvHead(file, 40);
    for (const row of head.sampleRows) {
      expect(parseCsvRecord(row.join(","), ",")).toHaveLength(2);
    }
  });
});
