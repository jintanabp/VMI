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

  const parsed = body.effectiveFrom
    ? new Date(String(body.effectiveFrom))
    : new Date();
  const effectiveFrom = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

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
  if (validIds.length === 0) {
    return { status: 400, body: { error: "ไม่พบสินค้า" } };
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
          acknowledgedAt: null,
        },
      })
    )
  );
  bumpStoreDataVersion(storeId);

  return { status: 200, body: { success: true, count: validIds.length } };
}

export async function removeBlocks(
  storeId: string,
  body: { skuIds?: unknown }
): Promise<ServiceResult> {
  const skuIds = parseSkuIds(body.skuIds);
  if (skuIds.length === 0) {
    return { status: 400, body: { error: "ต้องเลือกอย่างน้อย 1 สินค้า" } };
  }
  const result = await prisma.storeSkuBlock.deleteMany({
    where: { storeId, skuId: { in: skuIds } },
  });
  bumpStoreDataVersion(storeId);
  return { status: 200, body: { success: true, count: result.count } };
}
