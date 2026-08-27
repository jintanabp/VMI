import { NextResponse } from "next/server";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { getDatasetInventory } from "@/lib/fabric/datasets";
import { peekCsvIndex, readCsvHead } from "@/lib/fabric/csv-page-reader";
import {
  DB_TABLES,
  redactedFieldsFor,
  visibleFieldsFor,
} from "@/lib/admin/db-explorer";
import { countDbTable } from "@/lib/admin/db-explorer-query";

export const dynamic = "force-dynamic";

/**
 * รายการแหล่งข้อมูลทั้งหมดที่หน้า "ดูข้อมูลดิบ" เปิดดูได้
 *
 * ห้ามสแกนไฟล์ตรงนี้เด็ดขาด — หน้านี้เปิดทุกครั้งที่เข้ามา ถ้าเผลอนับแถวจะกลายเป็นสแกน
 * item_barcode_map_v2.csv (69MB) ทุกครั้งที่เปิดหน้า · อ่านแค่ stat + หัวไฟล์ 64KB
 * ส่วนจำนวนแถวเอาจากดัชนีที่ทำไว้แล้วเท่านั้น (null = ยังไม่เคยเปิดดูไฟล์นี้)
 */
export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const csv = getDatasetInventory().map((row) => {
    let headers: string[] = [];
    if (row.exists) {
      try {
        headers = readCsvHead(row.localPath).headers;
      } catch {
        // อ่านหัวไฟล์ไม่ได้ (สิทธิ์/ไฟล์เสีย) — ยังโชว์แถวไว้ให้เห็นว่ามีชุดข้อมูลนี้อยู่
      }
    }
    const indexed = row.exists ? peekCsvIndex(row.localPath) : null;
    return {
      id: row.id,
      label: row.label,
      fileName: row.fileName,
      exists: row.exists,
      bytes: row.bytes,
      mtime: row.mtime,
      required: row.required,
      headers,
      columnCount: headers.length,
      /** null = ยังไม่เคยทำดัชนี ไม่ใช่ "ไม่มีแถว" */
      rowCount: indexed?.rowCount ?? null,
    };
  });

  const db = await Promise.all(
    DB_TABLES.map(async (def) => ({
      model: def.model,
      label: def.label,
      group: def.group,
      rows: await countDbTable(def),
      columnCount: visibleFieldsFor(def).length,
      redacted: redactedFieldsFor(def),
    }))
  );

  return NextResponse.json({ csv, db });
}
