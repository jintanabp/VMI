import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  forEachCsvRecord,
  parseCsv,
  parseCsvRecord,
  readCsvFile,
  sniffSeparator,
  streamCsvFile,
} from "@/lib/fabric/csv";

/**
 * ตัวตัด record ของ CSV — เทสต์นี้ปักบั๊กจริง 2 ตัวที่เจอกับ item_barcode_map_v2.csv (69MB)
 *
 * 1) ตัวตัดเดิมตัดที่ \n ดื้อ ๆ ค่าที่มี newline อยู่ข้างในจึงถูกฉีกเป็นหลายแถว
 * 2) ตอนแก้ข้อ 1 รอบแรกดันไปเจอว่าต้นทางไม่ escape เครื่องหมายนิ้ว: `2"x50y` ทำให้
 *    สถานะคำพูดค้าง แล้วตัวตัดกลืนบรรทัดถัดไปยาว 98,196 ตัวอักษร สินค้าหายไป 15 รหัส
 *    ทันที — เทสต์ข้อ "เครื่องหมายนิ้ว" ด้านล่างคือกันไม่ให้พลาดซ้ำ
 */

const tmpFiles: string[] = [];

function writeCsv(content: string): string {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "vmi-csv-")),
    "sample.csv"
  );
  fs.writeFileSync(file, content, "utf-8");
  tmpFiles.push(file);
  return file;
}

function records(text: string): string[] {
  const out: string[] = [];
  forEachCsvRecord(text, (r) => out.push(r));
  return out;
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const file = tmpFiles.pop()!;
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

describe("forEachCsvRecord", () => {
  it("newline ที่อยู่ในเครื่องหมายคำพูด ไม่ใช่จุดจบ record", () => {
    const text = 'code,name\n"A","บรรทัดหนึ่ง\nบรรทัดสอง"\n"B","ปกติ"';
    expect(records(text)).toHaveLength(3);
    expect(parseCsvRecord(records(text)[1], ",")[1]).toBe(
      "บรรทัดหนึ่ง\nบรรทัดสอง"
    );
  });

  it("เครื่องหมายนิ้วที่ต้นทางไม่ได้ escape ต้องไม่กลืนบรรทัดถัดไป", () => {
    // เคสจริงจาก item_barcode_map_v2.csv: "R80522 - เทปสีใส2"x50y"
    const text =
      'code,name\n"R80522","R80522 - เทปสีใส2"x50y"\n"949016","บางจาก"\n"R80562","ม้วนฟิล์ม"';
    const recs = records(text);
    expect(recs).toHaveLength(4);
    expect(parseCsvRecord(recs[1], ",")[1]).toBe('R80522 - เทปสีใส2"x50y');
    // แถวถัดไปต้องยังเป็นแถวของตัวเอง ไม่ถูกดูดเข้าไปรวม
    expect(parseCsvRecord(recs[2], ",")[0]).toBe("949016");
  });

  it('"" คือ quote ตัวอักษร ไม่ใช่การปิดค่า', () => {
    const cells = parseCsvRecord('"เขาบอกว่า ""สวัสดี"" ครับ","ถัดไป"', ",");
    expect(cells[0]).toBe('เขาบอกว่า "สวัสดี" ครับ');
    expect(cells[1]).toBe("ถัดไป");
  });

  it("ตัวคั่นที่อยู่ในคำพูดไม่ตัดเซลล์", () => {
    expect(parseCsvRecord('"ก, ข","ค"', ",")).toEqual(["ก, ข", "ค"]);
  });

  it("รองรับ CRLF โดยไม่ทิ้ง \\r ไว้ท้ายเซลล์", () => {
    const recs = records("code,name\r\nA,ก\r\nB,ข\r\n");
    expect(recs).toHaveLength(3);
    expect(parseCsvRecord(recs[2], ",")).toEqual(["B", "ข"]);
  });

  it("ข้าม BOM ที่ต้นไฟล์ตัวเดียว ไม่ไปยุ่งกับเซลล์แรกของแถวข้อมูล", () => {
    const recs = records("﻿code,name\nA,ก");
    expect(parseCsvRecord(recs[0], ",")[0]).toBe("code");
    expect(parseCsvRecord(recs[1], ",")[0]).toBe("A");
  });

  it("บรรทัดว่างและ newline ปิดท้ายไฟล์ไม่กลายเป็นแถวผี", () => {
    expect(records("code\nA\n\nB\n")).toEqual(["code", "A", "B"]);
  });

  it("record สุดท้ายที่ไม่มี newline ปิดท้าย ต้องไม่หาย", () => {
    expect(records("code\nA")).toEqual(["code", "A"]);
  });
});

describe("sniffSeparator", () => {
  it("หัวตารางมี tab = ไฟล์คั่นด้วย tab", () => {
    expect(sniffSeparator("code\tname")).toBe("\t");
  });

  it("comma เป็นค่าตั้งต้น และตัวคั่นในคำพูดไม่ถูกนับ", () => {
    expect(sniffSeparator('"ชื่อ; สกุล","รหัส"')).toBe(",");
  });
});

describe("parseCsv / streamCsvFile / readCsvFile", () => {
  it("ทั้งสองทางต้องได้จำนวนแถวเท่ากันเสมอ", () => {
    const file = writeCsv(
      'code,name\n"A","มี\nnewline"\n"B","เทป2"x50y"\n"C","ปกติ"\n'
    );
    const read = readCsvFile(file);
    let streamed = 0;
    const { rowCount } = streamCsvFile(file, () => {
      streamed++;
    });
    expect(read.rows).toHaveLength(3);
    expect(rowCount).toBe(3);
    expect(streamed).toBe(3);
  });

  it("streamCsvFile ทำคีย์เป็นตัวเล็ก ส่วน parseCsv เก็บหัวตารางตามต้นฉบับ", () => {
    const file = writeCsv("ProductCode,Name\n001,ก\n");
    expect(readCsvFile(file).headers).toEqual(["ProductCode", "Name"]);
    const seen: Record<string, string>[] = [];
    streamCsvFile(file, (row) => seen.push(row));
    expect(seen[0].productcode).toBe("001");
  });

  it("แถวที่มีคอลัมน์ไม่ครบ ได้ค่าว่าง ไม่ใช่ undefined", () => {
    const { rows } = parseCsv("a,b,c\n1,2\n");
    expect(rows[0]).toEqual({ a: "1", b: "2", c: "" });
  });
});
