import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { datasetMeta, isDatasetId } from "@/lib/fabric/datasets";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  readCsvPage,
  searchCsv,
} from "@/lib/fabric/csv-page-reader";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  dataset: z.string().min(1).max(64),
  offset: z.coerce.number().int().min(0).max(50_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(200).optional(),
  column: z.coerce.number().int().min(0).max(500).optional(),
  v: z.string().max(64).optional(),
});

export async function GET(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "พารามิเตอร์ไม่ถูกต้อง" }, { status: 400 });
  }
  const { dataset, offset, limit, q, column, v } = parsed.data;

  /**
   * allowlist เป็น "รหัสชุดข้อมูล" ไม่ใช่ path — client ไม่เคยส่ง path มาเลย
   * เส้นทางไฟล์มาจาก datasetMeta() ฝั่งเซิร์ฟเวอร์ ซึ่งเคารพ env ที่ย้ายที่ไฟล์ไว้ด้วย
   * (paths.ts ให้ override ได้ทุกตัว) จึงไม่มีช่องให้ยิง path traversal ตั้งแต่แรก
   */
  if (!isDatasetId(dataset)) {
    return NextResponse.json({ error: "unknown_dataset" }, { status: 400 });
  }
  const meta = datasetMeta(dataset);
  if (!meta) {
    return NextResponse.json({ error: "unknown_dataset" }, { status: 400 });
  }

  const localPath = meta.localPath;
  if (!path.isAbsolute(localPath)) {
    return NextResponse.json({ error: "bad_dataset_path" }, { status: 500 });
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(localPath);
  } catch {
    return NextResponse.json(
      { error: "file_missing", label: meta.label, fileName: path.basename(localPath) },
      { status: 404 }
    );
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: "bad_dataset_path" }, { status: 500 });
  }

  console.info(
    "[data-explorer] %s อ่าน csv:%s offset=%d limit=%d%s",
    session.email ?? "?",
    dataset,
    offset,
    limit,
    q ? ` q=${JSON.stringify(q)}` : ""
  );

  try {
    const page = q
      ? searchCsv(localPath, { q, limit, column: column ?? null })
      : readCsvPage(localPath, { offset, limit });

    return NextResponse.json({
      ...page,
      datasetId: dataset,
      label: meta.label,
      fileName: path.basename(localPath),
      version: page.index.version,
      // client ถือ version ไว้แล้วส่งกลับมาเป็น ?v= — ไม่ตรงแปลว่ามีรอบ sync คั่นระหว่างเปิดดู
      changed: Boolean(v && v !== page.index.version),
    });
  } catch (err) {
    console.error("[data-explorer] อ่าน %s ไม่สำเร็จ:", dataset, err);
    return NextResponse.json(
      { error: "read_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
