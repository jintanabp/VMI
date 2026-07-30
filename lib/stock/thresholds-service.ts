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

    await prisma.storeGroupThreshold.deleteMany({ where: { storeId, section } });
    bumpStoreDataVersion(storeId);

    const skuIds: string[] = Array.isArray(body.skuIds)
      ? body.skuIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];
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

  const minDays = parseDays(body.minDays, DEFAULT_MIN_DAYS);
  const maxDays = parseDays(body.maxDays, DEFAULT_MAX_DAYS);
  if (maxDays < minDays) {
    return { status: 400, body: { error: "MAX ต้องไม่น้อยกว่า MIN" } };
  }

  // per-SKU override
  if (body.skuId) {
    const { stock } = getRepositories();
    await stock.updateStockThresholds(storeId, String(body.skuId), {
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
