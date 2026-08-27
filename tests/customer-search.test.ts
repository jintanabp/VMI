import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerDirectory } from "@/lib/fabric/customer-directory";

/**
 * ค้นหาลูกค้าในหน้าแอดมิน — ใช้ตอนเพิ่มคลัง VDA ใหม่แล้วไม่รู้รหัสลูกค้า
 *
 * ปักสองจุดบอดของ search() เดิม: ไม่ค้นจังหวัด (ทั้งที่ dim_customer มีคอลัมน์ให้)
 * และคืนผลตามลำดับในไฟล์ ทำให้รหัสที่ตรงเป๊ะไปจมอยู่ท้ายผลลัพธ์
 */

const tmpDirs: string[] = [];

const HEADER =
  "AccountTo,AddressName,Amphur_NameThai,Area_NameEnglish,Area_NameThai,CustomerCode,CusGroup,CustomerGroup_NameThai,Customer_NameThai,Customer_NameEnglish,District_NameThai,Province_NameThai,CustomerCode_Name,AccountToCode_Name,TaxID,UpdateDate";

function row(o: {
  code: string;
  nameThai: string;
  nameEnglish?: string;
  province?: string;
  amphur?: string;
  taxId?: string;
  address?: string;
}): string {
  return [
    "",
    `"${o.address ?? "ที่อยู่"}"`,
    `"${o.amphur ?? ""}"`,
    '"BANGKOK"',
    '"กรุงเทพ"',
    `"${o.code}"`,
    '"99"',
    '"ลูกค้าขายเชื่อ"',
    `"${o.nameThai}"`,
    `"${o.nameEnglish ?? ""}"`,
    '""',
    `"${o.province ?? ""}"`,
    `"${o.code} - ${o.nameThai}"`,
    "",
    `"${o.taxId ?? ""}"`,
    '"2026-08-27 02:45:54"',
  ].join(",");
}

function directoryOf(rows: string[]): CustomerDirectory {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vmi-cust-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "dim_customer.csv");
  fs.writeFileSync(file, [HEADER, ...rows].join("\n") + "\n", "utf-8");
  return new CustomerDirectory(file);
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("searchRanked", () => {
  it("รหัสที่ตรงเป๊ะมาก่อนรหัสที่ขึ้นต้นเหมือนกัน และมาก่อนที่เจอในชื่อ", () => {
    const dir = directoryOf([
      row({ code: "3231847", nameThai: "พีเอสแอนด์เอสกรุ๊ป" }),
      row({ code: "323184", nameThai: "ร้านที่มี 3231847 อยู่ในชื่อ" }),
      row({ code: "3231847000", nameThai: "สาขาย่อย" }),
    ]);
    expect(dir.searchRanked("3231847").hits.map((h) => h.code)).toEqual([
      "3231847",
      "3231847000",
      "323184",
    ]);
  });

  it("ค้นด้วยชื่อจังหวัดได้ — จุดบอดเดิมที่ทำให้หาคลังไม่เจอ", () => {
    const dir = directoryOf([
      row({ code: "6082417", nameThai: "เจเจ แอนด์ ซี", province: "ตรัง" }),
      row({ code: "6130110", nameThai: "ลีวิวัฒน์ถาวร", province: "สงขลา" }),
    ]);
    const hits = dir.searchRanked("สงขลา").hits;
    expect(hits.map((h) => h.code)).toEqual(["6130110"]);
    expect(hits[0].province).toBe("สงขลา");
  });

  it("จังหวัดตรงเป๊ะ มาก่อนร้านที่บังเอิญมีชื่อจังหวัดอยู่ในชื่อ", () => {
    // เคสจริงจาก dim_customer: ค้น "สงขลา" แล้ว "มหาวิทยาลัยสงขลานครินทร์" (จ.ปัตตานี)
    // ขึ้นมาก่อนลูกค้าที่อยู่ จ.สงขลา จริง ๆ
    const dir = directoryOf([
      row({ code: "6100593", nameThai: "ร้านสหกรณ์มหาวิทยาลัยสงขลานครินทร์", province: "ปัตตานี" }),
      row({ code: "6131436", nameThai: "บริษัท อดิสร จำกัด", province: "สงขลา" }),
    ]);
    expect(dir.searchRanked("สงขลา").hits.map((h) => h.code)).toEqual([
      "6131436",
      "6100593",
    ]);
  });

  it("เลขผู้เสียภาษีที่มีขีดคั่น ค้นด้วยตัวเลขล้วนก็เจอ", () => {
    const dir = directoryOf([
      row({ code: "0025409", nameThai: "ยูนิรีเทล", taxId: "0-1055-57091-81-4" }),
    ]);
    expect(dir.searchRanked("0105557091814").hits.map((h) => h.code)).toEqual([
      "0025409",
    ]);
  });

  it("ชื่อที่ขึ้นต้นตรงมาก่อนชื่อที่เจอกลางคำ", () => {
    const dir = directoryOf([
      row({ code: "100", nameThai: "ร้านบิ๊กบิซพลัส สาขาสอง" }),
      row({ code: "200", nameThai: "บิ๊กบิซพลัส สำนักงานใหญ่" }),
    ]);
    expect(dir.searchRanked("บิ๊กบิซ").hits.map((h) => h.code)).toEqual(["200", "100"]);
  });

  it("ภาษาอังกฤษไม่สนตัวพิมพ์เล็กใหญ่", () => {
    const dir = directoryOf([
      row({ code: "300", nameThai: "เอ.ที.อาร์", nameEnglish: "A.T.R. PACKAGING" }),
    ]);
    expect(dir.searchRanked("a.t.r.").hits.map((h) => h.code)).toEqual(["300"]);
  });

  it("บอกจำนวนที่เจอทั้งหมด ไม่ใช่แค่จำนวนที่แสดง", () => {
    const rows = [];
    for (let i = 0; i < 40; i++) {
      rows.push(row({ code: `90000${String(i).padStart(2, "0")}`, nameThai: `ร้านทดสอบ ${i}` }));
    }
    const res = directoryOf(rows).searchRanked("ร้านทดสอบ", 5);
    expect(res.hits).toHaveLength(5);
    expect(res.total).toBe(40);
    expect(res.capped).toBe(false);
  });

  it("คำค้นว่างไม่คืนอะไรเลย (เดิมคืน 50 รายแรกของไฟล์ ซึ่งไม่มีความหมาย)", () => {
    const dir = directoryOf([row({ code: "100", nameThai: "ก" })]);
    expect(dir.searchRanked("   ")).toEqual({ hits: [], total: 0, capped: false });
  });

  it("ค้นไม่เจอ = ผลว่างและ total 0", () => {
    const dir = directoryOf([row({ code: "100", nameThai: "ก" })]);
    expect(dir.searchRanked("ไม่มีทางเจอ").total).toBe(0);
  });

  it("getByCode ยังคืนจังหวัดมาด้วย ใช้ยืนยันรหัสที่แอดมินกรอกได้", () => {
    const dir = directoryOf([
      row({ code: "3184635", nameThai: "เรืองวิทย์ภัทร", province: "นครปฐม", amphur: "เมืองนครปฐม" }),
    ]);
    const hit = dir.getByCode("3184635");
    expect(hit?.province).toBe("นครปฐม");
    expect(hit?.amphur).toBe("เมืองนครปฐม");
  });
});
