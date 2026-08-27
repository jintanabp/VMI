import { prisma } from "@/lib/prisma";
import {
  buildOrderBy,
  buildSelect,
  buildWhere,
  serializeRow,
  type DbCell,
  type DbTableDef,
} from "./db-explorer";

/**
 * ส่วนที่คุยกับฐานข้อมูลจริงของ db-explorer
 *
 * แยกออกมาจาก db-explorer.ts เพื่อให้ไฟล์ทะเบียน/กติกาการซ่อนคอลัมน์เป็น logic ล้วน
 * เทสต์ได้โดยไม่ต้องมี prisma client ต่อฐานข้อมูล (Prisma.dmmf เป็น object เฉย ๆ)
 */

interface Delegate {
  count: (args?: { where?: unknown }) => Promise<number>;
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
}

function delegateFor(def: DbTableDef): Delegate | null {
  const client = prisma as unknown as Record<string, Delegate | undefined>;
  const d = client[def.delegate];
  return d && typeof d.count === "function" ? d : null;
}

export async function countDbTable(def: DbTableDef): Promise<number | null> {
  const d = delegateFor(def);
  if (!d) return null;
  try {
    return await d.count();
  } catch {
    return null;
  }
}

export interface DbTablePage {
  rows: Record<string, DbCell>[];
  total: number;
}

export async function queryDbTable(
  def: DbTableDef,
  opts: {
    offset: number;
    limit: number;
    sort?: string;
    dir: "asc" | "desc";
    q?: string;
  }
): Promise<DbTablePage> {
  const d = delegateFor(def);
  if (!d) return { rows: [], total: 0 };

  const where = buildWhere(def, opts.q);
  const pending = [
    // นับด้วยเงื่อนไขเดียวกับที่ดึง ไม่งั้นตัวเลข "จาก N รายการ" จะไม่ตรงกับที่กรองอยู่
    d.count({ where }),
    d.findMany({
      where,
      orderBy: buildOrderBy(def, opts.sort, opts.dir),
      skip: opts.offset,
      take: opts.limit,
      // select เสมอ — findMany() เปล่า ๆ จะลากคอลัมน์ที่ซ่อนไว้ติดออกมาด้วย
      select: buildSelect(def),
    }),
  ] as const;

  // delegate ถูก cast เป็น type กลาง ๆ ไว้ (ตารางไหนก็ได้) จึงหลุด PrismaPromise ที่
  // $transaction แบบ array ต้องการ — อ่านอย่างเดียวสองคำสั่ง ใช้ Promise.all พอ
  const [total, rows] = await Promise.all(pending);

  return {
    rows: rows.map((r: Record<string, unknown>) => serializeRow(def, r)),
    total,
  };
}
