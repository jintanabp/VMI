import { NextResponse } from "next/server";
import { z } from "zod";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import {
  findDbTable,
  isSortableField,
  redactedFieldsFor,
  visibleFieldsFor,
} from "@/lib/admin/db-explorer";
import { queryDbTable } from "@/lib/admin/db-explorer-query";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  model: z.string().min(1).max(64),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  sort: z.string().max(64).optional(),
  dir: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(200).optional(),
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
  const { model, offset, limit, sort, dir, q } = parsed.data;

  // allowlist ทั้ง "ตารางไหนเปิดได้" และ "เรียงด้วยคอลัมน์ไหนได้" — ไม่มี raw SQL ทั้งเส้น
  const def = findDbTable(model);
  if (!def) {
    return NextResponse.json({ error: "unknown_model" }, { status: 400 });
  }
  const sortField = sort && isSortableField(def, sort) ? sort : undefined;

  console.info(
    "[data-explorer] %s อ่าน db:%s offset=%d limit=%d%s",
    session.email ?? "?",
    model,
    offset,
    limit,
    q ? ` q=${JSON.stringify(q)}` : ""
  );

  try {
    const { rows, total } = await queryDbTable(def, {
      offset,
      limit,
      sort: sortField,
      dir,
      q,
    });

    return NextResponse.json({
      model: def.model,
      label: def.label,
      group: def.group,
      columns: visibleFieldsFor(def),
      redacted: redactedFieldsFor(def),
      defaultSort: def.defaultSort,
      rows,
      total,
      offset,
      limit,
      sort: sortField ?? def.defaultSort.field,
      dir: sortField ? dir : def.defaultSort.dir,
    });
  } catch (err) {
    console.error("[data-explorer] อ่านตาราง %s ไม่สำเร็จ:", model, err);
    return NextResponse.json(
      { error: "read_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
