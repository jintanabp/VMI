import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clientIp,
  pruneRateLimit,
  resetRateLimit,
} from "@/lib/auth/rate-limit";

/**
 * เวลาถูกส่งเข้าไปเป็นพารามิเตอร์ ไม่ต้อง mock timer — เทสต์เดินเวลาเองได้
 * และไม่ขึ้นกับความเร็วเครื่องที่รัน
 */
const RULE = { limit: 3, windowMs: 60_000 };
const T0 = 1_700_000_000_000;

beforeEach(() => resetRateLimit());

describe("checkRateLimit", () => {
  it("ปล่อยผ่านจนครบโควตา แล้วบล็อกครั้งถัดไป", () => {
    expect(checkRateLimit("a", RULE, T0).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, T0).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, T0).allowed).toBe(true);

    const blocked = checkRateLimit("a", RULE, T0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("นับ remaining ถอยหลังถูกต้อง", () => {
    expect(checkRateLimit("a", RULE, T0).remaining).toBe(2);
    expect(checkRateLimit("a", RULE, T0).remaining).toBe(1);
    expect(checkRateLimit("a", RULE, T0).remaining).toBe(0);
  });

  it("คนละ key นับแยกกัน — IP หนึ่งเต็มไม่ลาก IP อื่นไปด้วย", () => {
    checkRateLimit("a", RULE, T0);
    checkRateLimit("a", RULE, T0);
    checkRateLimit("a", RULE, T0);
    expect(checkRateLimit("a", RULE, T0).allowed).toBe(false);
    expect(checkRateLimit("b", RULE, T0).allowed).toBe(true);
  });

  it("พ้นหน้าต่างแล้วปล่อยผ่านอีกครั้ง", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("a", RULE, T0);
    expect(checkRateLimit("a", RULE, T0 + 59_000).allowed).toBe(false);
    expect(checkRateLimit("a", RULE, T0 + 60_001).allowed).toBe(true);
  });

  it("หน้าต่างเลื่อนตามจริง ไม่ใช่รีเซ็ตยกล็อต", () => {
    checkRateLimit("a", RULE, T0);
    checkRateLimit("a", RULE, T0 + 30_000);
    checkRateLimit("a", RULE, T0 + 40_000);
    // ครั้งแรกหลุดหน้าต่างไปแล้ว เหลือ 2 ครั้งในหน้าต่าง → ยิงได้อีก 1
    expect(checkRateLimit("a", RULE, T0 + 61_000).allowed).toBe(true);
    expect(checkRateLimit("a", RULE, T0 + 61_000).allowed).toBe(false);
  });

  it("retryAfterSec นับจากครั้งเก่าสุดที่ยังอยู่ในหน้าต่าง", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("a", RULE, T0);
    const blocked = checkRateLimit("a", RULE, T0 + 20_000);
    expect(blocked.retryAfterSec).toBe(40);
  });

  it("ถูกบล็อกแล้วยิงซ้ำไม่ต่ออายุการบล็อก (ไม่นับ hit ที่โดนปฏิเสธ)", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("a", RULE, T0);
    checkRateLimit("a", RULE, T0 + 10_000);
    checkRateLimit("a", RULE, T0 + 20_000);
    expect(checkRateLimit("a", RULE, T0 + 60_001).allowed).toBe(true);
  });
});

describe("pruneRateLimit", () => {
  it("ล้าง key ที่เงียบเกินอายุ แต่เก็บ key ที่ยังยิงอยู่", () => {
    checkRateLimit("old", RULE, T0);
    checkRateLimit("new", RULE, T0 + 3_600_000);

    pruneRateLimit(T0 + 3_600_000, 60 * 60 * 1000);

    // "old" ถูกล้าง → เริ่มนับใหม่เต็มโควตา
    expect(checkRateLimit("old", RULE, T0 + 3_600_000).remaining).toBe(2);
    // "new" ยังอยู่ → เหลือโควตาน้อยกว่า
    expect(checkRateLimit("new", RULE, T0 + 3_600_000).remaining).toBe(1);
  });
});

describe("clientIp", () => {
  function req(headers: Record<string, string>) {
    return new Request("https://x/", { headers });
  }

  it("เอา hop แรกของ x-forwarded-for — ตัวหลังคือ nginx ไม่ใช่ผู้ใช้", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("ถอยไป x-real-ip เมื่อไม่มี x-forwarded-for", () => {
    expect(clientIp(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("ไม่มี header เลย → unknown (ยังนับรวมกันได้ ไม่ throw)", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
