import { describe, expect, it } from "vitest";
import { clampWindowToCoverage } from "@/lib/fabric/sold-history";

/**
 * กันบั๊ก "ศูนย์ปลอม": ต้นทาง (Fabric notebook) ส่งยอดขายมาแค่ 30 วันแล้วเขียนทับ
 * ทุกคืน ถ้าขอ 90 วันแล้วเติม 0 ให้ครบช่วง กราฟจะแบนยาว 60 วันแล้วพุ่ง และ
 * ค่าเฉลี่ยต่อวันจะถูกหารด้วย 90 = เจือจางลง 3 เท่าโดยไม่มีใครรู้
 */
describe("clampWindowToCoverage", () => {
  it("ขอ 90 วันแต่มีข้อมูล 30 วัน → ตัดเหลือ 30 (ไม่เติมศูนย์ย้อนหลัง)", () => {
    const r = clampWindowToCoverage("2026-07-28", "2026-08-26", 90);
    expect(r.start).toBe("2026-07-28");
    expect(r.effectiveDays).toBe(30);
  });

  it("ข้อมูลครอบคลุมเกินช่วงที่ขอ → ใช้ช่วงที่ขอตามเดิม", () => {
    const r = clampWindowToCoverage("2026-01-01", "2026-08-26", 30);
    expect(r.start).toBe("2026-07-28");
    expect(r.effectiveDays).toBe(30);
  });

  it("ข้อมูลครอบคลุมพอดีกับช่วงที่ขอ", () => {
    const r = clampWindowToCoverage("2026-07-28", "2026-08-26", 30);
    expect(r.start).toBe("2026-07-28");
    expect(r.effectiveDays).toBe(30);
  });

  it("มีข้อมูลวันเดียว → 1 วัน ไม่ใช่ 0 (กันหารศูนย์)", () => {
    const r = clampWindowToCoverage("2026-08-26", "2026-08-26", 30);
    expect(r.start).toBe("2026-08-26");
    expect(r.effectiveDays).toBe(1);
  });

  it("ยังไม่รู้วันแรก (ไฟล์ยังไม่โหลด) → ใช้ช่วงที่ขอ ไม่พัง", () => {
    const r = clampWindowToCoverage("", "2026-08-26", 7);
    expect(r.start).toBe("2026-08-20");
    expect(r.effectiveDays).toBe(7);
  });

  it("ข้ามเดือน/ปีคำนวณถูก", () => {
    const r = clampWindowToCoverage("2025-12-28", "2026-01-03", 30);
    expect(r.start).toBe("2025-12-28");
    expect(r.effectiveDays).toBe(7);
  });

  it("ขอ 7 วันโดยมีข้อมูลแค่ 3 วัน → หารด้วย 3 ไม่ใช่ 7", () => {
    const r = clampWindowToCoverage("2026-08-24", "2026-08-26", 7);
    expect(r.effectiveDays).toBe(3);
  });
});
