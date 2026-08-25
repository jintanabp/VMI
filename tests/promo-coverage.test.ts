import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ยามเฝ้าจำนวน SKU ที่ได้โปรจริง หลัง sync ไฟล์ C4 รอบใหม่
 *
 * บั๊กที่ต้องกันไม่ให้กลับมาเงียบ ๆ: ไฟล์ดึงสำเร็จ 1848 แถวเท่าเดิมทุกรอบ
 * ระบบไม่มี error ที่ไหน แต่ resolve เป็นโปรได้ 0 ตัว เพราะบริบทที่ใช้ค้นไม่ตรงไฟล์
 * "จำนวนแถวในไฟล์" จึงจับอาการนี้ไม่ได้เลย ต้องวัดตัวเลขปลายทางแล้วเทียบกับรอบก่อน
 */

/** promo-coverage ดึง directory จริงเข้ามาตอน import — mock ให้เหลือแต่ logic ที่จะทดสอบ */
vi.mock("@/lib/fabric", () => ({
  fabricPromoReady: () => false,
  getPromotionCreditDirectory: () => ({ allRows: () => [] }),
}));
vi.mock("@/lib/fabric/stock-cover", () => ({
  fabricStockReady: () => false,
  getStockCoverDirectory: () => ({ isLoaded: false, getForStore: () => [] }),
}));
vi.mock("@/lib/fabric/stock-rows", () => ({ listStockFromDbSources: () => [] }));
vi.mock("@/lib/fabric/refresh-status", () => ({
  readMasterRefreshStatus: () => ({}),
  writeMasterRefreshStatus: () => ({}),
}));

const { comparePromoCoverage } = await import("@/lib/fabric/promo-coverage");

type Snapshot = Parameters<typeof comparePromoCoverage>[1];

function snap(
  withPromo: number,
  checked = 845,
  byStore?: Snapshot["byStore"]
): Snapshot {
  return {
    at: "2026-08-25T00:00:00.000Z",
    skusWithPromo: withPromo,
    skusChecked: checked,
    byStore: byStore ?? { vda1: { withPromo, checked } },
    contextsInFile: ["E|98"],
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("comparePromoCoverage", () => {
  it("ศูนย์โปรทั้งระบบ = alarm เสมอ แม้ไม่มีรอบก่อนให้เทียบ", () => {
    // อาการเป๊ะ ๆ ของบั๊กเดิม — ต้องดังตั้งแต่รอบแรกที่เจอ ไม่ใช่รอให้มีรอบก่อน
    const v = comparePromoCoverage(undefined, snap(0));
    expect(v.level).toBe("alarm");
    expect(v.message).toContain("ไม่มี SKU ไหนได้โปรเลย");
  });

  it("บอกบริบทที่มีในไฟล์มาด้วยตอน alarm — เป็นเบาะแสแรกที่ต้องใช้", () => {
    expect(comparePromoCoverage(undefined, snap(0)).message).toContain("E|98");
  });

  it("รอบแรกที่มีโปร = ok ไม่เตือนทั้งที่ไม่มีอะไรให้เทียบ", () => {
    const v = comparePromoCoverage(undefined, snap(665));
    expect(v.level).toBe("ok");
    expect(v.dropPct).toBeNull();
  });

  it("ตกเกินเกณฑ์ = warn", () => {
    const v = comparePromoCoverage(snap(665), snap(300));
    expect(v.level).toBe("warn");
    expect(v.dropPct).toBeCloseTo(54.9, 1);
  });

  it("ตกน้อยกว่าเกณฑ์ = ok — โปรหมดอายุระหว่างเดือนเป็นเรื่องปกติ", () => {
    expect(comparePromoCoverage(snap(665), snap(600)).level).toBe("ok");
  });

  it("โปรเพิ่มขึ้น = ok และ dropPct ติดลบ", () => {
    const v = comparePromoCoverage(snap(600), snap(665));
    expect(v.level).toBe("ok");
    expect(v.dropPct).toBeLessThan(0);
  });

  it("ปรับเกณฑ์ด้วย PROMO_COVERAGE_DROP_ALERT_PCT ได้", () => {
    vi.stubEnv("PROMO_COVERAGE_DROP_ALERT_PCT", "5");
    expect(comparePromoCoverage(snap(665), snap(600)).level).toBe("warn");
  });

  it("คลังเดียวโปรหายเกลี้ยง = alarm แม้ยอดรวมยังไม่ตกถึงเกณฑ์", () => {
    // คลังหนึ่งพังคนเดียวคือเคสที่ยอดรวมกลบได้ง่ายที่สุด และเป็นเคสที่เคยเกิดจริง
    const prev = snap(800, 1690, {
      vda1: { withPromo: 665, checked: 845 },
      vda2: { withPromo: 135, checked: 845 },
    });
    const next = snap(665, 1690, {
      vda1: { withPromo: 665, checked: 845 },
      vda2: { withPromo: 0, checked: 845 },
    });
    const v = comparePromoCoverage(prev, next);
    expect(v.level).toBe("alarm");
    expect(v.storesGoneDark).toEqual(["vda2"]);
  });

  it("คลังที่ไม่เคยมีโปรอยู่แล้ว ไม่นับว่าเพิ่งดับ", () => {
    const prev = snap(665, 1690, {
      vda1: { withPromo: 665, checked: 845 },
      vda2: { withPromo: 0, checked: 845 },
    });
    const next = snap(665, 1690, {
      vda1: { withPromo: 665, checked: 845 },
      vda2: { withPromo: 0, checked: 845 },
    });
    const v = comparePromoCoverage(prev, next);
    expect(v.level).toBe("ok");
    expect(v.storesGoneDark).toEqual([]);
  });

  it("รอบก่อนเป็นศูนย์ = ไม่คิด % (กันหารด้วยศูนย์) และไม่เตือนตอนกำลังฟื้น", () => {
    const v = comparePromoCoverage(snap(0), snap(665));
    expect(v.level).toBe("ok");
    expect(v.dropPct).toBeNull();
  });
});
