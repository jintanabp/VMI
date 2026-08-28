import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

/**
 * ฐานข้อมูล SQLite ชั่วคราวสำหรับเทสต์ระดับ lib ที่ทำทรานแซกชันจริง
 *
 * นโยบายเดิมของ vitest.config.ts คือ "เทสต์เฉพาะ logic ล้วน" ซึ่งยังถูกอยู่กับ
 * สูตรคำนวณ — แต่ compare-and-set ตอนอนุมัติออเดอร์พิสูจน์ด้วย pure function
 * ไม่ได้เลย ต้องมี DB จริงถึงจะรู้ว่าสองคนกดพร้อมกันแล้วมีคนเดียวชนะจริงไหม
 * (โค้ดนี้เผาเลข PO และเขียนไฟล์ ถ้าพลาดคือเสียหายจริง)
 *
 * ใช้กับ lib เท่านั้น ไม่ใช่ API route หรือ component
 *
 * **สำคัญ:** `lib/prisma.ts` อ่าน DATABASE_URL ตอนสร้าง client ครั้งเดียว
 * ไฟล์เทสต์จึงต้อง `setTestDatabaseUrl()` **ก่อน** dynamic import โมดูลที่จะทดสอบ
 * (vitest แยก module registry ต่อไฟล์ จึงไม่รั่วข้ามไฟล์)
 */

const ROOT = path.resolve(__dirname, "..", "..");

export interface TestDb {
  url: string;
  filePath: string;
  cleanup: () => void;
}

/** สร้างไฟล์ DB ใหม่ + push schema ปัจจุบันลงไป */
export function createTestDatabase(label = "vmi-test"): TestDb {
  const filePath = path.join(
    os.tmpdir(),
    `${label}-${process.pid}-${Math.floor(performance.now() * 1000)}.db`
  );
  const url = `file:${filePath}`;

  execFileSync(
    "npx",
    ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
      shell: process.platform === "win32",
    }
  );

  return {
    url,
    filePath,
    cleanup: () => {
      for (const suffix of ["", "-journal", "-wal", "-shm"]) {
        const f = `${filePath}${suffix}`;
        if (fs.existsSync(f)) {
          try {
            fs.unlinkSync(f);
          } catch {
            // ไฟล์ถูกล็อกอยู่บน Windows — ปล่อยให้ระบบเก็บกวาด temp เอง
          }
        }
      }
    },
  };
}

/** ต้องเรียกก่อน import โมดูลที่ใช้ singleton จาก lib/prisma */
export function setTestDatabaseUrl(url: string) {
  process.env.DATABASE_URL = url;
}

/** prisma db push ต้องมี CLI — ข้ามเทสต์แทนที่จะแดงเมื่อรันในที่ที่ไม่มี */
export function prismaCliAvailable(): boolean {
  try {
    execFileSync("npx", ["prisma", "--version"], {
      cwd: ROOT,
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    return true;
  } catch {
    return false;
  }
}

export interface SeedResult {
  storeId: string;
  orderId: string;
  itemIds: string[];
}

/** ออเดอร์เล็กที่สุดที่อนุมัติได้จริง: ร้าน 1 + SKU 2 + ออเดอร์ pending 1 */
export async function seedPendingOrder(
  db: PrismaClient,
  opts: { storeCode?: string; qtys?: number[] } = {}
): Promise<SeedResult> {
  const storeCode = opts.storeCode ?? "vda1";
  const qtys = opts.qtys ?? [10, 20];

  const store = await db.store.create({
    data: { code: storeCode, name: storeCode.toUpperCase() },
  });

  const skus = await Promise.all(
    qtys.map((_, i) =>
      db.sku.create({
        data: { code: `SKU${i + 1}`, name: `สินค้า ${i + 1}` },
      })
    )
  );

  const order = await db.order.create({
    data: {
      storeId: store.id,
      status: "pending_approval",
      items: {
        create: qtys.map((qty, i) => ({
          skuId: skus[i]!.id,
          suggestedQty: qty,
          finalQty: qty,
          c4UnitPrice: 100,
        })),
      },
    },
    include: { items: true },
  });

  return {
    storeId: store.id,
    orderId: order.id,
    itemIds: order.items.map((i) => i.id),
  };
}
