"use client";

import { cn } from "@/lib/utils";

/**
 * หัวคอลัมน์ที่กดเรียงได้
 *
 * ยกแบบมาจาก SortableTh ใน components/stock/stock-page-client.tsx (ราว ๆ บรรทัด 2453)
 * ตั้งใจ "ก๊อป" ไม่ใช่ "ย้าย": ไฟล์นั้นยาว 2,500 บรรทัดและเป็นหน้าที่ร้านใช้จริงทุกวัน
 * การไปรื้อเพื่อ export ตัวเดียวมีความเสี่ยงมากกว่าประโยชน์ ถ้าวันหนึ่งจะรวมกัน
 * ให้ย้ายฝั่งนั้นมาใช้ตัวนี้แทน
 */
export interface SortState<TKey extends string> {
  key: TKey | null;
  dir: "asc" | "desc";
}

export function SortableTh<TKey extends string>({
  label,
  sub,
  sortKey,
  sort,
  onSort,
  align = "left",
  firstDir = "asc",
  title,
  className,
}: {
  label: string;
  sub?: string;
  sortKey: TKey;
  sort: SortState<TKey>;
  onSort: (key: TKey, firstDir?: "asc" | "desc") => void;
  align?: "left" | "right" | "center";
  firstDir?: "asc" | "desc";
  title?: string;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn(
        "px-2 py-2 leading-tight",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey, firstDir)}
        title={title ?? label}
        className="group inline-flex max-w-full items-center gap-0.5 rounded transition-colors hover:text-teal-700 dark:hover:text-teal-400"
      >
        {/* ชื่อคอลัมน์ห้ามหักกลางคำ — คอลัมน์แคบแล้วอ่านไม่ออก */}
        <span className="min-w-0 whitespace-nowrap">
          {label}
          {sub && (
            <>
              <br />
              <span className="text-[10px] font-normal text-slate-400">{sub}</span>
            </>
          )}
        </span>
        <span
          className={cn(
            "shrink-0 text-[10px]",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          )}
          aria-hidden
        >
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}
