"use client";

import { SortableTh, type SortState } from "@/components/ui/sortable-th";
import {
  MobileRow,
  MobileRowList,
  MobileRowTop,
} from "@/components/ui/mobile-row";
import { cn } from "@/lib/utils";

export type RawCell = string | number | boolean | null;

export interface RawColumn {
  /** คีย์ที่ใช้เรียง (ตารางฐานข้อมูล) — ไม่มี = เรียงไม่ได้ */
  sortKey?: string;
  label: string;
  sub?: string;
}

export interface RawRow {
  /** เลขแถวจริงในไฟล์ (0-based) — null สำหรับตารางฐานข้อมูล */
  index: number | null;
  cells: RawCell[];
}

export function formatCell(v: RawCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  return String(v);
}

/**
 * ตารางข้อมูลดิบ — ใช้ร่วมกันทั้งฝั่งไฟล์ CSV และตารางในฐานข้อมูล
 *
 * กติกาที่ห้ามพลาด (ผู้ใช้ถือว่าข้อความล้น/ตก/หายจากคอลัมน์ = บั๊ก ไม่ใช่ความสวยงาม):
 *  1. .vmi-table-wrap เป็น overflow:hidden ต้องมี .vmi-table-scroll ซ้อนข้างในเสมอ
 *     ไม่งั้นคอลัมน์ท้าย ๆ โดนตัดหายไปเลย
 *  2. ค่าที่ยาวต้องตกบรรทัด "ในคอลัมน์ตัวเอง" — .vmi-raw-cell คุมด้วย max-width +
 *     overflow-wrap: anywhere ไม่ใช่ ellipsis ที่ซ่อนตัวอักษรทิ้ง
 *  3. โหมดย่อต้องกดเอง และยังมี … + title + คลิกดูเต็มได้เสมอ
 */
export function RawTable({
  columns,
  rows,
  visible,
  compact,
  sort,
  onSort,
  onRowClick,
  emptyText,
}: {
  columns: RawColumn[];
  rows: RawRow[];
  /** ดัชนีคอลัมน์ที่ให้แสดง — undefined = แสดงทุกคอลัมน์ */
  visible?: number[];
  compact: boolean;
  sort?: SortState<string>;
  onSort?: (key: string) => void;
  onRowClick: (row: RawRow) => void;
  emptyText: string;
}) {
  const shown = visible ?? columns.map((_, i) => i);

  if (rows.length === 0) {
    return (
      <div className="vmi-table-wrap px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        {emptyText}
      </div>
    );
  }

  return (
    <>
      {/* เดสก์ท็อป */}
      <div className="vmi-table-wrap hidden lg:block">
        <div className="vmi-table-scroll vmi-scroll">
          <table className="vmi-raw-table w-max min-w-full text-left text-xs">
            <thead>
              <tr>
                <th className="px-2 py-2 text-right font-mono text-[10px]">#</th>
                {shown.map((ci) => {
                  const col = columns[ci];
                  if (!col) return null;
                  if (col.sortKey && sort && onSort) {
                    return (
                      <SortableTh
                        key={ci}
                        label={col.label}
                        sub={col.sub}
                        sortKey={col.sortKey}
                        sort={sort}
                        onSort={(k) => onSort(k)}
                      />
                    );
                  }
                  return (
                    <th key={ci} className="px-2 py-2 leading-tight" title={col.label}>
                      <span className="whitespace-nowrap">{col.label}</span>
                      {col.sub && (
                        <>
                          <br />
                          <span className="text-[10px] font-normal text-slate-400">
                            {col.sub}
                          </span>
                        </>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={row.index ?? ri}
                  onClick={() => onRowClick(row)}
                  className="cursor-pointer"
                  title="กดเพื่อดูทั้งแถว"
                >
                  <td className="px-2 py-1.5 text-[10px]">
                    {row.index != null ? (row.index + 1).toLocaleString() : ri + 1}
                  </td>
                  {shown.map((ci) => {
                    const raw = row.cells[ci] ?? null;
                    const text = formatCell(raw);
                    return (
                      <td key={ci} className="px-2 py-1.5">
                        {raw === null ? (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        ) : (
                          <span
                            className={cn(
                              compact ? "vmi-raw-cell--compact" : "vmi-raw-cell"
                            )}
                            title={compact ? text : undefined}
                          >
                            {text}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* มือถือ/แท็บเล็ต — ตารางแนวนอนอ่านไม่ได้จริงบนจอแคบ ใช้การ์ดต่อแถวแทน */}
      <div className="lg:hidden">
        <MobileRowList>
          {rows.map((row, ri) => {
            // หัวการ์ดต้องเป็นคอลัมน์แรกที่ "มีค่าจริง" ไม่ใช่คอลัมน์ที่ 0 เสมอ —
            // dim_customer คอลัมน์แรก (AccountTo) ว่างทุกแถว หัวการ์ดเลยเป็น "—" ทั้งหน้า
            const filled = shown.filter(
              (ci) => formatCell(row.cells[ci] ?? null).trim() !== ""
            );
            const first = filled[0] ?? shown[0];
            const second = filled[1] ?? shown[1];
            return (
              <MobileRow key={row.index ?? ri} onClick={() => onRowClick(row)}>
                <MobileRowTop>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      <span className="mr-1 font-mono text-[10px] font-normal text-slate-400">
                        {columns[first ?? 0]?.label}
                      </span>
                      {formatCell(row.cells[first ?? 0] ?? null) || "—"}
                    </p>
                    {second != null && second !== first && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        <span className="mr-1 font-mono text-[10px] text-slate-400">
                          {columns[second]?.label ?? ""}
                        </span>
                        {formatCell(row.cells[second] ?? null) || "—"}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    #{row.index != null ? (row.index + 1).toLocaleString() : ri + 1}
                  </span>
                </MobileRowTop>
                <p className="mt-1 text-[11px] text-slate-400">
                  แตะเพื่อดูครบทุกคอลัมน์ ({shown.length})
                </p>
              </MobileRow>
            );
          })}
        </MobileRowList>
      </div>
    </>
  );
}
