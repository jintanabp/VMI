import { prisma } from "@/lib/prisma";
import type { ErpEndpoint } from "./erp-endpoint";
import {
  buildErpPayload,
  checkErpReadiness,
  erpReasonLabel,
  type ErpPayloadContext,
  type ErpOrderPayload,
} from "./erp-payload";
import type { PoDocument } from "./po-document";

/**
 * ส่ง PO เข้า ERP — ประกอบ → ตรวจความพร้อม → POST → ประทับผล
 *
 * ⚠️ **ไฟล์นี้ยิงออกเน็ตได้จริง** ต่างจาก erp-payload.ts ที่แปลงข้อมูลอย่างเดียว ·
 * แต่ปลายทางมาจาก `erpEndpoint()` ซึ่งตอนนี้คืน `null` เสมอ (ดู erp-endpoint.ts)
 * และ `checkErpReadiness` ยังกันทุกใบไว้ที่ `missing_delivery_date` อยู่แล้ว
 *
 * ## ทำไมแยกเป็นสองฟังก์ชัน
 * `postErpPayload()` ไม่แตะฐานข้อมูลเลยและรับ `fetch` เข้ามาได้ ⇒ เทสต์ทุกสาขาของคำตอบ
 * ปลายทางได้โดยไม่ต้องมีเซิร์ฟเวอร์ · ส่วน `stampErpSuccess/Failure()` แตะแค่ฐานข้อมูล
 * ⇒ เทสต์เรื่องกดพร้อมกันได้โดยไม่ต้อง mock เน็ต
 */

/** ความยาวสูงสุดของข้อความ error ที่เก็บ — ค่าเดียวกับที่ฝั่ง ocr ใช้ */
export const ERP_ERROR_MAX_LEN = 1000;

export type ErpSendFailure =
  | "not_ready"
  | "http_error"
  | "rejected"
  | "timeout"
  | "network";

export type ErpPostResult =
  | { ok: true; insertedRows: number | null; raw: string }
  | { ok: false; failure: ErpSendFailure; message: string; httpStatus: number | null };

/** ตัดข้อความยาว ๆ ให้พอเก็บลงฐานข้อมูลโดยยังอ่านออกว่าเกิดอะไร */
export function truncateErpError(text: string): string {
  const clean = text.trim();
  return clean.length <= ERP_ERROR_MAX_LEN
    ? clean
    : `${clean.slice(0, ERP_ERROR_MAX_LEN - 1)}…`;
}

/**
 * ตีความคำตอบของปลายทาง
 *
 * **สำเร็จเมื่อ HTTP 200 และ `body.success === true` เท่านั้น** — 200 อย่างเดียวไม่พอ
 * เพราะปลายทางตอบ 200 พร้อม `success: false` ได้ · เทียบแบบ identity ⇒ สตริง `"true"` ไม่ผ่าน
 * (กติกาเดียวกับที่ฝั่ง ocr ใช้)
 */
export function interpretErpResponse(
  httpStatus: number,
  bodyText: string
): ErpPostResult {
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // ปลายทางตอบอะไรที่ไม่ใช่ JSON — เก็บดิบไว้ให้คนอ่าน อย่าเดาว่าสำเร็จ
    return {
      ok: false,
      failure: httpStatus === 200 ? "rejected" : "http_error",
      message: truncateErpError(bodyText || `HTTP ${httpStatus} (ตอบกลับว่างเปล่า)`),
      httpStatus,
    };
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const resultMsg =
    typeof obj.resultMsg === "string" ? obj.resultMsg : "";

  if (httpStatus === 200 && obj.success === true) {
    const result = (obj.result ?? {}) as Record<string, unknown>;
    const inserted = result.insertedRows;
    return {
      ok: true,
      insertedRows: typeof inserted === "number" ? inserted : null,
      raw: truncateErpError(resultMsg || "Insert Success"),
    };
  }

  return {
    ok: false,
    // 200 แต่ success ไม่เป็น true = ปลายทางปฏิเสธอย่างตั้งใจ ไม่ใช่ระบบล่ม
    failure: httpStatus === 200 ? "rejected" : "http_error",
    message: truncateErpError(resultMsg || `HTTP ${httpStatus}`),
    httpStatus,
  };
}

/**
 * ยิง payload ไปปลายทาง — ไม่แตะฐานข้อมูล
 *
 * ⚠️ **timeout ไม่ได้แปลว่าไม่เข้า** — คำขออาจสำเร็จฝั่ง ERP แล้วคำตอบหายกลางทาง
 * ผู้เรียก **ห้ามยิงซ้ำเอง** เมื่อได้ `timeout` เพราะยิงซ้ำ = คู่เลขซ้ำ = เผาเลข PO ทิ้ง 6 เดือน
 * และสเปกไม่มี idempotency key ให้ยิงซ้ำอย่างปลอดภัย (รอคำตอบข้อ 4.8)
 */
export async function postErpPayload(
  payload: ErpOrderPayload,
  endpoint: ErpEndpoint,
  fetchImpl: typeof fetch = fetch
): Promise<ErpPostResult> {
  try {
    const res = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(endpoint.timeoutMs),
    });
    const text = await res.text();
    return interpretErpResponse(res.status, text);
  } catch (err) {
    const name = (err as Error)?.name ?? "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      ok: false,
      failure: timedOut ? "timeout" : "network",
      message: truncateErpError(
        timedOut
          ? `ปลายทางไม่ตอบภายใน ${endpoint.timeoutMs / 1000} วินาที — ` +
            "อาจเข้าไปแล้วหรือไม่เข้าก็ได้ ห้ามส่งซ้ำจนกว่าจะตรวจกับ ERP"
          : `ติดต่อปลายทางไม่ได้: ${(err as Error)?.message ?? String(err)}`
      ),
      httpStatus: null,
    };
  }
}

/**
 * ประทับว่าส่งสำเร็จ — **compare-and-set** กันสองคนกดพร้อมกัน
 *
 * `updateMany` บน `{ poNumber, erpSentAt: null }` แล้วเช็ค `count === 1` ·
 * ถ้าได้ 0 แปลว่ามีคนประทับไปก่อนแล้ว ⇒ คนที่สองต้องรู้ตัวว่าแพ้ ไม่ใช่เขียนทับเงียบ ๆ
 *
 * **ไม่ล้าง `erpError`** ที่ค้างจากครั้งก่อน — ประวัติว่าเคยพลาดมีค่ากว่าความสะอาด
 */
export async function stampErpSuccess(
  poNumber: string,
  insertedRows: number | null,
  now: Date = new Date()
): Promise<{ stamped: boolean }> {
  const { count } = await prisma.purchaseOrder.updateMany({
    where: { poNumber, erpSentAt: null },
    data: { erpSentAt: now, erpAttemptedAt: now, erpInsertedRows: insertedRows },
  });
  return { stamped: count === 1 };
}

/** ประทับว่าพยายามแล้วไม่สำเร็จ — **ไม่แตะ `erpSentAt`** ใบจึงยังอยู่ในคิว */
export async function stampErpFailure(
  poNumber: string,
  message: string,
  now: Date = new Date()
): Promise<void> {
  await prisma.purchaseOrder.updateMany({
    where: { poNumber },
    data: { erpAttemptedAt: now, erpError: truncateErpError(message) },
  });
}

export interface ErpDeliveryOutcome {
  ok: boolean;
  poNumber: string;
  failure?: ErpSendFailure;
  /** ข้อความไทยพร้อมโชว์ — ไม่ใช่ code ดิบ */
  message?: string;
  insertedRows?: number | null;
  /** จำนวนบรรทัดที่ส่งไป — ไว้เทียบกับ insertedRows */
  sentRows?: number;
}

/**
 * ส่งหนึ่งใบตั้งแต่ต้นจนจบ
 *
 * ตรวจความพร้อมก่อนเสมอ และ**ไม่ยิงอะไรเลยถ้าใบไม่พร้อม** — เหตุผลที่ไม่พร้อมคืนกลับไป
 * เป็นข้อความไทยที่บอกทางแก้ (จาก `erpReasonLabel`) ไม่ใช่ชื่อ reason code ดิบ
 */
export async function deliverPoToErp(args: {
  doc: PoDocument;
  ctx: ErpPayloadContext;
  endpoint: ErpEndpoint;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<ErpDeliveryOutcome> {
  const { doc, ctx, endpoint } = args;
  const now = args.now ?? new Date();

  const readiness = checkErpReadiness(doc, ctx);
  if (!readiness.ok) {
    return {
      ok: false,
      poNumber: doc.poNumber,
      failure: "not_ready",
      message: readiness.reasons.map(erpReasonLabel).join(" · "),
    };
  }

  const payload = buildErpPayload(doc, ctx);
  const result = await postErpPayload(payload, endpoint, args.fetchImpl);

  if (!result.ok) {
    await stampErpFailure(doc.poNumber, result.message, now);
    return {
      ok: false,
      poNumber: doc.poNumber,
      failure: result.failure,
      message: result.message,
    };
  }

  const { stamped } = await stampErpSuccess(
    doc.poNumber,
    result.insertedRows,
    now
  );
  if (!stamped) {
    // ปลายทางรับไปแล้วจริง แต่มีคนประทับก่อน — ไม่ใช่ความล้มเหลวของการส่ง
    // บอกให้รู้ว่าเกิดอะไร ดีกว่าเงียบแล้วปล่อยให้คนเข้าใจว่าตัวเองเป็นคนส่ง
    return {
      ok: true,
      poNumber: doc.poNumber,
      message: "ใบนี้ถูกประทับว่าส่งแล้วโดยคำขออื่นก่อนหน้า",
      insertedRows: result.insertedRows,
      sentRows: payload.orderDetail.length,
    };
  }

  return {
    ok: true,
    poNumber: doc.poNumber,
    insertedRows: result.insertedRows,
    sentRows: payload.orderDetail.length,
  };
}
