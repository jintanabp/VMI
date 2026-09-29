import { prisma } from "@/lib/prisma";
import { bumpStoreDataVersion } from "@/lib/fabric/data-version";
import type { ServiceResult } from "./thresholds-service";

/**
 * รายการหยุดสั่งต่อร้าน แยกออกจาก route เพื่อให้ฝั่งร้านค้าและฝั่งแอดมินใช้ร่วมกัน
 * (effectiveTo = null คือหยุดถาวร)
 */

export interface BlockRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  reason: string;
  effectiveFrom: string;
  /** null = หยุดถาวร */
  effectiveTo: string | null;
  createdAt: string;
  createdBy: string;
}

export function parseSkuIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((v) => String(v).trim()).filter((v) => v.length > 0)),
  ];
}

/** ย้อนหลังได้ไม่เกินเท่านี้ — เผื่อเขตเวลา/ร้านตั้งช่วงดึกของเมื่อวาน */
export const MAX_BACKDATE_MS = 86_400_000;

/**
 * วันเริ่มหยุดสั่งที่ย้อนหลังเกิน 1 วันไม่รับ — เดิมพิมพ์ปีผิด (เช่น 2025) ก็บันทึกได้
 * แล้วรายการกลายเป็น "หยุดมานานแล้ว" ทันที
 *
 * ยกเว้นเมื่อเป็นวันเริ่มเดิมของรายการที่มีอยู่ (แก้เหตุผล/วันสิ้นสุดของรายการเก่า
 * ฟอร์มส่งวันเริ่มเดิมกลับมา — ห้ามทำให้แก้รายการเก่าไม่ได้)
 * ช่อง datetime-local ตัดวินาทีทิ้ง จึงเทียบระดับนาที
 */
export function effectiveFromError(
  from: Date,
  now: Date,
  existingFroms: Date[] = []
): string | null {
  if (from.getTime() >= now.getTime() - MAX_BACKDATE_MS) return null;
  const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
  if (existingFroms.length > 0 && existingFroms.every((d) => minute(d) === minute(from))) {
    return null;
  }
  return "วันที่เริ่มหยุดสั่งย้อนหลังได้ไม่เกิน 1 วัน";
}

export async function listBlocks(storeId: string): Promise<BlockRow[]> {
  const blocks = await prisma.storeSkuBlock.findMany({
    where: { storeId },
    include: { sku: { select: { code: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return blocks.map((b) => ({
    skuId: b.skuId,
    skuCode: b.sku.code,
    skuName: b.sku.name,
    reason: b.reason,
    effectiveFrom: b.effectiveFrom.toISOString(),
    effectiveTo: b.effectiveTo?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    createdBy: b.createdBy,
  }));
}

export interface BlockUpsertInput {
  skuIds?: unknown;
  reason?: unknown;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
  permanent?: unknown;
}

export async function upsertBlocks(
  storeId: string,
  actorEmail: string,
  body: BlockUpsertInput
): Promise<ServiceResult> {
  const skuIds = parseSkuIds(body.skuIds);
  const reason = String(body.reason ?? "").trim();

  if (skuIds.length === 0) {
    return { status: 400, body: { error: "ต้องเลือกอย่างน้อย 1 สินค้า" } };
  }
  if (!reason) {
    return { status: 400, body: { error: "ต้องระบุเหตุผล" } };
  }

  // วันที่อ่านไม่ออกต้องตอบ 400 — เดิมแอบแทนเป็น "ตอนนี้" แล้วตอบสำเร็จ
  const effectiveFrom = body.effectiveFrom
    ? new Date(String(body.effectiveFrom))
    : new Date();
  if (Number.isNaN(effectiveFrom.getTime())) {
    return { status: 400, body: { error: "วันที่เริ่มไม่ถูกต้อง" } };
  }

  // permanent = true หรือไม่ระบุวันสิ้นสุด → หยุดถาวร (effectiveTo = null)
  let effectiveTo: Date | null = null;
  if (body.permanent !== true && body.effectiveTo) {
    const to = new Date(String(body.effectiveTo));
    if (Number.isNaN(to.getTime())) {
      return { status: 400, body: { error: "วันที่สิ้นสุดไม่ถูกต้อง" } };
    }
    if (to <= effectiveFrom) {
      return {
        status: 400,
        body: { error: "วันที่สิ้นสุดต้องอยู่หลังวันที่เริ่ม" },
      };
    }
    effectiveTo = to;
  }

  // กัน skuId ที่ไม่มีจริง (FK) — เฉพาะที่มีในตาราง Sku
  const existing = await prisma.sku.findMany({
    where: { id: { in: skuIds } },
    select: { id: true },
  });
  const validIds = existing.map((s) => s.id);
  // มีรหัสที่ไม่รู้จักปนมา = บอกผู้ใช้ ไม่ใช่บันทึกเฉพาะตัวที่เจอแล้วตอบว่าสำเร็จ
  if (validIds.length !== skuIds.length) {
    const missing = skuIds.length - validIds.length;
    return {
      status: 400,
      body: {
        error:
          validIds.length === 0
            ? "ไม่พบสินค้า"
            : `ไม่พบสินค้า ${missing} รายการ — รีเฟรชหน้าแล้วลองใหม่`,
      },
    };
  }

  const existingBlocks = await prisma.storeSkuBlock.findMany({
    where: { storeId, skuId: { in: validIds } },
    select: { effectiveFrom: true },
  });
  const fromError = effectiveFromError(
    effectiveFrom,
    new Date(),
    // ต้องมีรายการเดิมครบทุกตัวถึงจะอนุโลม — ตัวใหม่ห้ามย้อนหลัง
    existingBlocks.length === validIds.length
      ? existingBlocks.map((b) => b.effectiveFrom)
      : []
  );
  if (fromError) {
    return { status: 400, body: { error: fromError } };
  }

  await prisma.$transaction(
    validIds.map((skuId) =>
      prisma.storeSkuBlock.upsert({
        where: { storeId_skuId: { storeId, skuId } },
        create: {
          storeId,
          skuId,
          reason,
          effectiveFrom,
          effectiveTo,
          createdBy: actorEmail,
        },
        update: {
          reason,
          effectiveFrom,
          effectiveTo,
          createdBy: actorEmail,
          // ร้านตั้งหยุดสั่งซ้ำ/แก้ช่วงเวลา = เรื่องใหม่ ทุกคนต้องเห็นเป็นยังไม่อ่านอีกครั้ง
          acknowledgedAt: null,
          reads: { deleteMany: {} },
        },
      })
    )
  );
  bumpStoreDataVersion(storeId);

  return { status: 200, body: { success: true, count: validIds.length } };
}

export async function removeBlocks(
  storeId: string,
  body: { skuIds?: unknown },
  /** ใครยกเลิก — หัวข้อแจ้งเตือนเซลล์ต้องไม่บอกว่า "ร้าน" ถ้าแอดมินเป็นคนกด */
  by: "store" | "admin" = "store"
): Promise<ServiceResult> {
  const skuIds = parseSkuIds(body.skuIds);
  if (skuIds.length === 0) {
    return { status: 400, body: { error: "ต้องเลือกอย่างน้อย 1 สินค้า" } };
  }
  const removing = await prisma.storeSkuBlock.findMany({
    where: { storeId, skuId: { in: skuIds } },
    select: { sku: { select: { code: true, name: true } } },
  });
  const result = await prisma.storeSkuBlock.deleteMany({
    where: { storeId, skuId: { in: skuIds } },
  });
  // ยกเลิกหยุดสั่ง = สั่งได้อีกแล้ว — เดิมรายการแค่หายไปจากกระดิ่งเซลล์เงียบ ๆ ไม่มีใครรู้ (QA 28 ก.ย. 69)
  if (removing.length > 0) {
    const names = removing.map((b) => `${b.sku.code} ${b.sku.name}`);
    await prisma.salesNotification.create({
      data: {
        storeId,
        kind: "sku_unblocked",
        title: `${by === "admin" ? "แอดมิน" : "ร้าน"}ยกเลิกหยุดสั่ง ${removing.length} รายการ`,
        detail: names.slice(0, 5).join(" · ") + (names.length > 5 ? ` · และอีก ${names.length - 5}` : ""),
      },
    });
  }
  bumpStoreDataVersion(storeId);
  return { status: 200, body: { success: true, count: result.count } };
}
