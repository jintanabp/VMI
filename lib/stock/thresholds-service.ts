import { prisma } from "@/lib/prisma";
import { getRepositories } from "@/lib/repositories";
import { bumpStoreDataVersion } from "@/lib/fabric/data-version";

/**
 * ตรรกะ MIN/MAX ต่อร้าน แยกออกจาก route เพื่อให้ฝั่งร้านค้าและฝั่งแอดมิน
 * ใช้โค้ดชุดเดียวกัน — สำคัญเพราะทุกเส้นต้อง bumpStoreDataVersion()
 * ไม่งั้นแก้ค่าแล้วหน้าเว็บยังเห็นตัวเลขเดิมจาก cache
 */

export {
  DEFAULT_MAX_DAYS,
  DEFAULT_MIN_DAYS,
} from "./threshold-defaults";
import { DEFAULT_MAX_DAYS, DEFAULT_MIN_DAYS } from "./threshold-defaults";
import { isInvalidDaysValue } from "@/lib/stock/threshold-rules";

export interface GroupThresholdRow {
  section: string;
  minDays: number;
  maxDays: number;
}

/** ผลลัพธ์แบบเดียวกับที่ route คืน — { status, body } ให้ route แค่ห่อ NextResponse */
export interface ServiceResult {
  status: number;
  body: Record<string, unknown>;
}

export function parseDays(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}


/** เพดาน MAX — ตรงกับ daysError() ฝั่งหน้าจอ */
export const MAX_THRESHOLD_DAYS = 365;

/**
 * ตรวจ min/max ของคำขอที่ไม่ใช่ reset — คืนข้อความ error หรือค่าที่ใช้ได้
 *
 * ต้องส่งมาครบทั้งคู่: เดิมไม่ส่งมาเลยก็ผ่าน แล้ว parseDays แทนเป็น 7/15 เงียบ ๆ
 * = คำขอว่างเปล่ารีเซ็ตทั้งแบรนด์โดยตอบ 200 (หน้าจอส่งครบทั้งคู่เสมออยู่แล้ว)
 */
export function validateThresholdDays(
  minRaw: unknown,
  maxRaw: unknown
): { ok: true; minDays: number; maxDays: number } | { ok: false; error: string } {
  const missing = (v: unknown) =>
    v === undefined || v === null || (typeof v === "string" && !v.trim());
  if (missing(minRaw) || missing(maxRaw)) {
    return { ok: false, error: "ต้องระบุทั้ง MIN และ MAX" };
  }
  if (isInvalidDaysValue(minRaw) || isInvalidDaysValue(maxRaw)) {
    return { ok: false, error: "MIN / MAX ต้องเป็นจำนวนเต็มวัน และไม่ติดลบ" };
  }
  const minDays = Number(minRaw);
  const maxDays = Number(maxRaw);
  if (maxDays < minDays) {
    return { ok: false, error: "MAX ต้องไม่น้อยกว่า MIN" };
  }
  if (maxDays > MAX_THRESHOLD_DAYS) {
    return { ok: false, error: `MAX ต้องไม่เกิน ${MAX_THRESHOLD_DAYS} วัน` };
  }
  return { ok: true, minDays, maxDays };
}

/** skuId ที่ไม่มีในตาราง Sku — ต้องตอบ 400 ก่อน upsert ไม่งั้นชน FK กลายเป็น 500 */
async function unknownSkuIds(skuIds: string[]): Promise<string[]> {
  if (skuIds.length === 0) return [];
  const found = await prisma.sku.findMany({
    where: { id: { in: skuIds } },
    select: { id: true },
  });
  const ok = new Set(found.map((s) => s.id));
  return skuIds.filter((id) => !ok.has(id));
}

export async function listGroupThresholds(
  storeId: string
): Promise<GroupThresholdRow[]> {
  const groups = await prisma.storeGroupThreshold.findMany({
    where: { storeId },
    orderBy: { section: "asc" },
  });
  return groups.map((g) => ({
    section: g.section,
    minDays: g.minDays,
    maxDays: g.maxDays,
  }));
}

export interface ThresholdPatchInput {
  reset?: boolean;
  section?: unknown;
  sections?: unknown;
  skuId?: unknown;
  skuIds?: unknown;
  minDays?: unknown;
  maxDays?: unknown;
}

export async function applyThresholdPatch(
  storeId: string,
  body: ThresholdPatchInput
): Promise<ServiceResult> {
  if (body.reset) {
    const section = String(body.section ?? "").trim();
    if (!section) {
      return { status: 400, body: { error: "ต้องระบุ section" } };
    }

    const skuIds: string[] = Array.isArray(body.skuIds)
      ? [...new Set(body.skuIds.map((id: unknown) => String(id)).filter(Boolean))]
      : [];
    // ตรวจก่อนลบค่ากลุ่ม — ไม่งั้นล้มกลางทางแล้วค่ากลุ่มหายไปแล้วครึ่งหนึ่ง
    if ((await unknownSkuIds(skuIds)).length > 0) {
      return { status: 400, body: { error: "ไม่พบสินค้าบางรายการ — รีเฟรชหน้าแล้วลองใหม่" } };
    }

    await prisma.storeGroupThreshold.deleteMany({ where: { storeId, section } });
    bumpStoreDataVersion(storeId);

    if (skuIds.length > 0) {
      const { stock } = getRepositories();
      await Promise.all(
        skuIds.map((skuId) =>
          stock.updateStockThresholds(storeId, skuId, {
            minDays: DEFAULT_MIN_DAYS,
            maxDays: DEFAULT_MAX_DAYS,
          })
        )
      );
    }

    return {
      status: 200,
      body: {
        success: true,
        scope: "section-reset",
        minDays: DEFAULT_MIN_DAYS,
        maxDays: DEFAULT_MAX_DAYS,
      },
    };
  }

  const days = validateThresholdDays(body.minDays, body.maxDays);
  if (!days.ok) {
    return { status: 400, body: { error: days.error } };
  }
  const { minDays, maxDays } = days;

  // per-SKU override
  if (body.skuId) {
    const skuId = String(body.skuId);
    if ((await unknownSkuIds([skuId])).length > 0) {
      return { status: 400, body: { error: "ไม่พบสินค้านี้ — รีเฟรชหน้าแล้วลองใหม่" } };
    }
    const { stock } = getRepositories();
    await stock.updateStockThresholds(storeId, skuId, {
      minDays,
      maxDays,
    });
    bumpStoreDataVersion(storeId);
    return { status: 200, body: { success: true, scope: "sku" } };
  }

  // bulk: หลายแบรนด์ (Section) พร้อมกัน
  if (Array.isArray(body.sections)) {
    const sections = [
      ...new Set(
        body.sections
          .map((s: unknown) => String(s).trim())
          .filter((s: string): s is string => s.length > 0)
      ),
    ] as string[];
    if (sections.length === 0) {
      return { status: 400, body: { error: "ต้องเลือกอย่างน้อย 1 แบรนด์" } };
    }
    await prisma.$transaction(
      sections.map((section) =>
        prisma.storeGroupThreshold.upsert({
          where: { storeId_section: { storeId, section } },
          create: { storeId, section, minDays, maxDays },
          update: { minDays, maxDays },
        })
      )
    );
    bumpStoreDataVersion(storeId);
    return {
      status: 200,
      body: { success: true, scope: "sections", count: sections.length },
    };
  }

  // group (Section) default
  const section = String(body.section ?? "").trim();
  if (!section) {
    return { status: 400, body: { error: "ต้องระบุ section หรือ skuId" } };
  }

  await prisma.storeGroupThreshold.upsert({
    where: { storeId_section: { storeId, section } },
    create: { storeId, section, minDays, maxDays },
    update: { minDays, maxDays },
  });
  bumpStoreDataVersion(storeId);

  return { status: 200, body: { success: true, scope: "section" } };
}
