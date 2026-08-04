import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { AssortedMapping } from "@/lib/fabric/assorted-mapping";
import {
  hasPromoGroupName,
  isPromoGroupLabelShortened,
  promoGroupLabel,
  promoGroupShortLabel,
  promoGroupTooltip,
} from "@/lib/promo/promo-group-label";

/**
 * ชื่อกลุ่มโปรจาก cft_assorted_mapping.csv
 *
 * ไฟล์จริงมีสองอย่างที่ทำให้ "แค่ทำ map" ไม่พอ: หลายสิบกลุ่มมี DESCRIPTIONASSORTED ว่าง
 * และบางรหัสมีหลายแถวที่คำอธิบายไม่ตรงกัน — สองเคสนี้ต้องได้ผลเดิมทุกครั้งที่โหลด
 * ไม่งั้นชื่อกลุ่มบนหน้าเว็บจะสลับไปมาตามลำดับแถวในไฟล์
 */
const tmpFiles: string[] = [];

function writeCsv(content: string): string {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "vmi-assorted-")),
    "cft_assorted_mapping.csv"
  );
  fs.writeFileSync(file, content, "utf-8");
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const file = tmpFiles.pop()!;
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

const HEADER = "ASSORTEDPRODUCTGROUP,DESCRIPTIONASSORTED,USERCODE,UpdateDate";

describe("AssortedMapping", () => {
  it("อ่านรหัสกลุ่ม → ชื่อกลุ่มได้", () => {
    const m = new AssortedMapping();
    m.load(
      writeCsv(
        `${HEADER}\nPJ2.7SUPER,เปาซุปเปอร์2700G,AM103,2026-08-04 09:29:02\n`
      )
    );
    expect(m.loadError).toBeNull();
    expect(m.nameFor("PJ2.7SUPER")).toBe("เปาซุปเปอร์2700G");
    expect(m.labelFor(" PJ2.7SUPER ")).toBe("เปาซุปเปอร์2700G");
  });

  it("คำอธิบายว่าง / ไม่รู้จักรหัส → ถอยไปใช้รหัสกลุ่มเดิม", () => {
    const m = new AssortedMapping();
    m.load(writeCsv(`${HEADER}\nEMPTY1,,AM124,2026-08-04 09:29:02\n`));
    expect(m.nameFor("EMPTY1")).toBe("");
    expect(m.labelFor("EMPTY1")).toBe("EMPTY1");
    expect(m.labelFor("NEVER_SEEN")).toBe("NEVER_SEEN");
  });

  it("รหัสซ้ำคำอธิบายชนกัน → ยึดแถวที่ UpdateDate ใหม่สุด (ไม่ขึ้นกับลำดับแถว)", () => {
    const rows = [
      "ATRB,ยา80g+แปรง,AM103,2026-07-01 10:00:00",
      "ATRB,เซ็นท์แอนดรูว์ยาสีฟันการ์ตูน80ก.,AM103,2026-08-04 09:29:02",
    ];
    for (const order of [rows, [...rows].reverse()]) {
      const m = new AssortedMapping();
      m.load(writeCsv(`${HEADER}\n${order.join("\n")}\n`));
      expect(m.nameFor("ATRB")).toBe("เซ็นท์แอนดรูว์ยาสีฟันการ์ตูน80ก.");
    }
  });

  it("แถวที่คำอธิบายว่างไม่ลบชื่อที่อ่านได้แล้ว", () => {
    const m = new AssortedMapping();
    m.load(
      writeCsv(
        `${HEADER}\nMF,มาม่าเส้นใหญ่น้ำใส,AM124,2026-08-04 09:29:02\nMF,,AM124,2026-08-05 09:29:02\n`
      )
    );
    expect(m.nameFor("MF")).toBe("มาม่าเส้นใหญ่น้ำใส");
  });

  it("ไม่มีไฟล์ / คอลัมน์ขาด → mapping ว่าง + บอกสาเหตุ ไม่ throw", () => {
    const missing = new AssortedMapping();
    missing.load(path.join(os.tmpdir(), "vmi-ไม่มีไฟล์นี้.csv"));
    expect(missing.isLoaded).toBe(false);
    expect(missing.loadError).toContain("ไม่พบไฟล์");

    const wrong = new AssortedMapping();
    wrong.load(writeCsv("FOO,BAR\n1,2\n"));
    expect(wrong.isLoaded).toBe(false);
    expect(wrong.loadError).toContain("DESCRIPTIONASSORTED");
    expect(wrong.labelFor("ANY")).toBe("ANY");
  });
});

describe("promoGroupLabel", () => {
  const names = { AP50K: "เปาซุปเปอร์2700G", EMPTY1: "  " };

  it("มีชื่อ → ใช้ชื่อ, ไม่มี/ว่าง → ใช้รหัสกลุ่ม", () => {
    expect(promoGroupLabel("AP50K", names)).toBe("เปาซุปเปอร์2700G");
    expect(promoGroupLabel("EMPTY1", names)).toBe("EMPTY1");
    expect(promoGroupLabel("UNKNOWN", names)).toBe("UNKNOWN");
    // ยังโหลด mapping ไม่เสร็จ — ต้องได้รหัสกลุ่ม ไม่ใช่ค่าว่าง
    expect(promoGroupLabel("AP50K", undefined)).toBe("AP50K");
    expect(promoGroupLabel(null, names)).toBe("");
  });

  it("ชื่อย่อในที่แคบ — ตัดวงเล็บไล่รสออกก่อน แล้วค่อยตัดความยาว", () => {
    const long = {
      A: "เปาซุปเปอร์2700G(ไวท์,ซอฟท์,คัลเลอร์)",
      B: "มาม่าเส้นเล็ก/ใหญ่p.6(รสต้มยำ/หมูน้ำตก/น้ำใส/เย็นตาโพ)",
      C: "(ไวท์,ซอฟท์)",
      D: "ก".repeat(40),
    };
    expect(promoGroupShortLabel("A", long)).toBe("เปาซุปเปอร์2700G");
    expect(promoGroupShortLabel("B", long)).toBe("มาม่าเส้นเล็ก/ใหญ่p.6");
    // หน้าวงเล็บสั้นเกินจนไม่สื่อความ → คงชื่อเต็มไว้
    expect(promoGroupShortLabel("C", long)).toBe("(ไวท์,ซอฟท์)");
    // ไม่มีวงเล็บและยาวจริง → ตัดพร้อม …
    expect(promoGroupShortLabel("D", long)).toHaveLength(27);
    expect(promoGroupShortLabel("D", long).endsWith("…")).toBe(true);
    // ไม่รู้จักรหัส → ยังได้รหัสกลุ่มเดิม ไม่ใช่ค่าว่าง
    expect(promoGroupShortLabel("UNKNOWN", long)).toBe("UNKNOWN");
    expect(isPromoGroupLabelShortened("A", long)).toBe(true);
    expect(isPromoGroupLabelShortened("UNKNOWN", long)).toBe(false);
  });

  it("tooltip เห็นทั้งชื่อและรหัสไว้เทียบกับ C4", () => {
    expect(promoGroupTooltip("AP50K", names)).toBe(
      "เปาซุปเปอร์2700G · รหัสกลุ่ม AP50K"
    );
    expect(promoGroupTooltip("UNKNOWN", names)).toBe("กลุ่ม UNKNOWN");
    expect(hasPromoGroupName("AP50K", names)).toBe(true);
    expect(hasPromoGroupName("EMPTY1", names)).toBe(false);
  });
});
