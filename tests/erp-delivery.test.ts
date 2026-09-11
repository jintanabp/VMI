import { describe, expect, it } from "vitest";
import {
  ERP_ERROR_MAX_LEN,
  interpretErpResponse,
  postErpPayload,
  truncateErpError,
} from "@/lib/po/erp-delivery";
import { erpEndpoint, ERP_UAT_URL } from "@/lib/po/erp-endpoint";
import type { ErpOrderPayload } from "@/lib/po/erp-payload";

/**
 * การตีความคำตอบของ ERP
 *
 * เคสที่แพงที่สุดคือ **200 พร้อม `success: false`** — ถ้าอ่านว่าสำเร็จ ใบจะถูกประทับว่าส่งแล้ว
 * ทั้งที่ปลายทางปฏิเสธ แล้วจะไม่มีใครรู้จนกว่าของไม่มา
 */

const PAYLOAD: ErpOrderPayload = {
  orderNo: "V126082801A",
  customerCode: "3231847",
  salesmanCode: "S091",
  divisionCode: "E",
  createDate: "2026-08-28 13:59:00",
  deliveryDate: "2026-08-31 00:00:00",
  countItem: 1,
  orderDetail: [
    {
      productCode: "111294",
      promotionTo: "111294",
      quantityCase: 5,
      quantityUnit: "B",
      discountPercent: 0,
      discountUnit: 0,
      unitPrice: 1050,
      amount: 5250,
      vatAmount: 367.5,
      buyOrFree: "B",
    },
  ],
};

const ok = (body: unknown, status = 200) =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("interpretErpResponse", () => {
  it("200 + success: true = สำเร็จ และอ่าน insertedRows มาเก็บ", () => {
    const r = interpretErpResponse(
      200,
      JSON.stringify({
        success: true,
        result: { orderNo: "V1", insertedRows: 2 },
        resultMsg: "Insert Success",
      })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.insertedRows).toBe(2);
  });

  it("**200 แต่ success: false = ล้มเหลว** ไม่ใช่สำเร็จ", () => {
    const r = interpretErpResponse(
      200,
      JSON.stringify({
        success: false,
        result: null,
        resultMsg: "orderNo and customerCode already exists within 6 months",
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("rejected");
      expect(r.message).toContain("already exists within 6 months");
    }
  });

  it('สตริง "true" ไม่ผ่าน — เทียบแบบ identity เท่านั้น', () => {
    const r = interpretErpResponse(200, JSON.stringify({ success: "true" }));
    expect(r.ok).toBe(false);
  });

  it("400 = http_error พร้อมข้อความดิบของปลายทาง", () => {
    const r = interpretErpResponse(
      400,
      JSON.stringify({ success: false, resultMsg: "countItem must equal orderDetail length" })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("http_error");
      expect(r.httpStatus).toBe(400);
      expect(r.message).toContain("countItem");
    }
  });

  it("ตอบมาไม่เป็น JSON ก็ไม่เดาว่าสำเร็จ", () => {
    const r = interpretErpResponse(200, "<html>502 Bad Gateway</html>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("502");
  });

  it("insertedRows ที่ไม่ใช่ตัวเลข = null ไม่ใช่ 0 (0 แปลว่าไม่มีอะไรเข้า)", () => {
    const r = interpretErpResponse(
      200,
      JSON.stringify({ success: true, result: { insertedRows: "2" } })
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.insertedRows).toBeNull();
  });
});

describe("truncateErpError", () => {
  it("ข้อความยาวเกินถูกตัดแต่ยังรู้ว่าถูกตัด", () => {
    const out = truncateErpError("ก".repeat(ERP_ERROR_MAX_LEN + 500));
    expect(out.length).toBe(ERP_ERROR_MAX_LEN);
    expect(out.endsWith("…")).toBe(true);
  });

  it("ข้อความสั้นไม่ถูกแตะ", () => {
    expect(truncateErpError("  พัง  ")).toBe("พัง");
  });
});

describe("postErpPayload", () => {
  it("ยิงไปที่ URL ที่ส่งเข้ามา ด้วย POST + JSON", async () => {
    let seenUrl = "";
    let seenMethod = "";
    let seenBody = "";
    const spy = (async (url: string, init: RequestInit) => {
      seenUrl = String(url);
      seenMethod = String(init.method);
      seenBody = String(init.body);
      return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await postErpPayload(PAYLOAD, { url: "https://example.test/x", timeoutMs: 1000 }, spy);
    expect(r.ok).toBe(true);
    expect(seenUrl).toBe("https://example.test/x");
    expect(seenMethod).toBe("POST");
    expect(JSON.parse(seenBody).orderNo).toBe("V126082801A");
  });

  it("เน็ตพัง = network ไม่ใช่ timeout", async () => {
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await postErpPayload(PAYLOAD, { url: "https://x.test", timeoutMs: 50 }, boom);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe("network");
  });

  it("**timeout ต้องบอกว่าอาจเข้าไปแล้ว และห้ามส่งซ้ำ**", async () => {
    const hang = (async () => {
      const e = new Error("timed out");
      e.name = "TimeoutError";
      throw e;
    }) as unknown as typeof fetch;
    const r = await postErpPayload(PAYLOAD, { url: "https://x.test", timeoutMs: 15000 }, hang);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure).toBe("timeout");
      expect(r.message).toContain("ห้ามส่งซ้ำ");
    }
  });

  it("200 + success:false ที่ผ่าน fetch จริง ก็ยังนับเป็นล้มเหลว", async () => {
    const r = await postErpPayload(
      PAYLOAD,
      { url: "https://x.test", timeoutMs: 1000 },
      ok({ success: false, resultMsg: "nope" })
    );
    expect(r.ok).toBe(false);
  });
});

describe("erpEndpoint — ประตูที่ยังปิดอยู่", () => {
  it("คืน null เพราะสวิตช์ส่งจริงยังปิด", () => {
    expect(erpEndpoint()).toBeNull();
  });

  it("**โค้ดที่รันได้ต้องไม่มีโฮสต์ production อยู่เลย**", () => {
    expect(ERP_UAT_URL).toContain("spcuatws.sahapat.com");
    expect(ERP_UAT_URL).not.toContain("spcws.sahapat.com");
  });
});
