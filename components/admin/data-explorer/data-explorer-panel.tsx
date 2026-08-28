"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Columns3, Database, FileSpreadsheet, RefreshCw, Search, X } from "lucide-react";
import { AnchoredPanel, PanelHeader } from "@/components/ui/anchored-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NoticeBanner } from "@/components/ui/notice-banner";
import type { SortState } from "@/components/ui/sortable-th";
import { appPath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { RawRowModal, type RawRowDetail } from "./raw-row-modal";
import { RawTable, type RawCell, type RawColumn, type RawRow } from "./raw-table";
import { apiFetch } from "@/lib/api-fetch";

/**
 * หน้า "ดูข้อมูลดิบ" — เปิดตารางเต็มของทุกแหล่งข้อมูลที่ระบบใช้
 *
 * เหตุผลที่ต้องมี: `cft_promotion_cash.csv` เคยมีเนื้อของไฟล์เครดิตอยู่ข้างใน แล้ว sync
 * ขึ้นเขียวทุกวันเป็นเดือนโดยไม่มีใครรู้ เพราะไม่มีทางเปิดดูว่าข้างในเป็นอะไรจริง ๆ
 * ชื่อไฟล์กับสถานะ sync พิสูจน์เนื้อในไม่ได้ — ต้องเปิดดูของจริงเท่านั้น
 */

const PAGE_SIZE = 100;
/** คอลัมน์เยอะกว่านี้ค่อยซ่อนบางส่วนไว้ก่อน (item_barcode_map_v2 มี 30 คอลัมน์) */
const AUTO_HIDE_OVER = 15;
const AUTO_SHOW_FIRST = 12;

interface CsvSource {
  id: string;
  label: string;
  fileName: string;
  exists: boolean;
  bytes: number | null;
  mtime: string | null;
  required: boolean;
  headers: string[];
  columnCount: number;
  rowCount: number | null;
}

interface DbSource {
  model: string;
  label: string;
  group: string;
  rows: number | null;
  columnCount: number;
  redacted: string[];
}

interface SourcesResponse {
  csv: CsvSource[];
  db: DbSource[];
}

interface CsvPageResponse {
  index: {
    version: string;
    headers: string[];
    rowCount: number;
    separator: string;
    ragged: boolean;
    hasEmbeddedNewlines: boolean;
    maxColumns: number;
    minColumns: number;
    size: number;
    scanMs: number;
  };
  rows: { i: number; cells: string[] }[];
  offset: number;
  limit: number;
  truncatedCells: number;
  search: {
    q: string;
    complete: boolean;
    reason: "complete" | "limit" | "timeout";
    scannedRows: number;
  } | null;
  label: string;
  fileName: string;
  version: string;
  changed: boolean;
  error?: string;
}

interface DbColumnMeta {
  name: string;
  kind: string;
  nullable: boolean;
  derived?: boolean;
  label?: string;
}

interface DbPageResponse {
  model: string;
  label: string;
  columns: DbColumnMeta[];
  redacted: string[];
  rows: Record<string, RawCell>[];
  total: number;
  offset: number;
  limit: number;
  sort: string;
  dir: "asc" | "desc";
  error?: string;
}

type Selection = { kind: "csv"; id: string } | { kind: "db"; model: string };

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function parseSelection(raw: string | null): Selection | null {
  if (!raw) return null;
  const [kind, ...rest] = raw.split(":");
  const value = rest.join(":");
  if (!value) return null;
  if (kind === "csv") return { kind: "csv", id: value };
  if (kind === "db") return { kind: "db", model: value };
  return null;
}

function selectionKey(sel: Selection): string {
  return sel.kind === "csv" ? `csv:${sel.id}` : `db:${sel.model}`;
}

export function DataExplorerPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selection, setSelection] = useState<Selection | null>(() =>
    parseSelection(searchParams.get("src"))
  );
  const [pickerOpen, setPickerOpen] = useState(!selection);
  const [tab, setTab] = useState<"csv" | "db">(
    parseSelection(searchParams.get("src"))?.kind === "db" ? "db" : "csv"
  );
  const [sourceFilter, setSourceFilter] = useState("");

  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<string>>({ key: null, dir: "asc" });
  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [detail, setDetail] = useState<RawRowDetail | null>(null);
  const columnsAnchor = useRef<HTMLDivElement>(null);
  const lastVersion = useRef<string | null>(null);

  // debounce 300ms — ค้นฝั่งเซิร์ฟเวอร์ทั้งไฟล์ ไม่ใช่กรองเฉพาะหน้าที่โหลดมา
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // เปลี่ยนแหล่ง/คำค้น/การเรียง ต้องกลับหน้าแรกเสมอ ไม่งั้นค้างอยู่หน้า 40 ของผลลัพธ์ 3 หน้า
  useEffect(() => {
    setPage(0);
  }, [selection, search, sort]);

  const sourcesQuery = useQuery<SourcesResponse>({
    queryKey: ["data-explorer", "sources"],
    queryFn: async () => {
      const res = await apiFetch(appPath("/api/admin/data-explorer/sources"));
      if (!res.ok) throw new Error("โหลดรายการแหล่งข้อมูลไม่สำเร็จ");
      return res.json();
    },
  });

  const csvQuery = useQuery<CsvPageResponse>({
    enabled: selection?.kind === "csv",
    queryKey: [
      "data-explorer",
      "csv",
      selection?.kind === "csv" ? selection.id : null,
      page,
      search,
    ],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (selection?.kind !== "csv") throw new Error("no selection");
      const params = new URLSearchParams({
        dataset: selection.id,
        offset: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("q", search);
      if (lastVersion.current) params.set("v", lastVersion.current);
      const res = await apiFetch(
        appPath(`/api/admin/data-explorer/csv?${params.toString()}`)
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "อ่านไฟล์ไม่สำเร็จ");
      return body;
    },
  });

  const dbQuery = useQuery<DbPageResponse>({
    enabled: selection?.kind === "db",
    queryKey: [
      "data-explorer",
      "db",
      selection?.kind === "db" ? selection.model : null,
      page,
      search,
      sort.key,
      sort.dir,
    ],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (selection?.kind !== "db") throw new Error("no selection");
      const params = new URLSearchParams({
        model: selection.model,
        offset: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
        dir: sort.dir,
      });
      if (sort.key) params.set("sort", sort.key);
      if (search) params.set("q", search);
      const res = await apiFetch(
        appPath(`/api/admin/data-explorer/db?${params.toString()}`)
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "อ่านตารางไม่สำเร็จ");
      return body;
    },
  });

  useEffect(() => {
    if (csvQuery.data?.version) lastVersion.current = csvQuery.data.version;
  }, [csvQuery.data?.version]);

  const choose = useCallback(
    (sel: Selection) => {
      setSelection(sel);
      setPickerOpen(false);
      setSearchInput("");
      setSearch("");
      setSort({ key: null, dir: "asc" });
      setHidden(new Set());
      lastVersion.current = null;
      router.replace(`?src=${encodeURIComponent(selectionKey(sel))}`, {
        scroll: false,
      });
    },
    [router]
  );

  // ── แปลงผลลัพธ์ให้เป็นรูปเดียวกันก่อนวาด ───────────────────────────────────
  const view = useMemo(() => {
    if (selection?.kind === "csv" && csvQuery.data) {
      const d = csvQuery.data;
      const headers = d.index.headers;
      const columnCount = Math.max(headers.length, d.index.maxColumns);
      const columns: RawColumn[] = Array.from({ length: columnCount }, (_, i) => ({
        label: headers[i] ?? `คอลัมน์ ${i + 1}`,
      }));
      const rows: RawRow[] = d.rows.map((r) => ({ index: r.i, cells: r.cells }));
      return {
        columns,
        rows,
        total: d.index.rowCount,
        title: d.label,
        subtitle: d.fileName,
      };
    }
    if (selection?.kind === "db" && dbQuery.data) {
      const d = dbQuery.data;
      const columns: RawColumn[] = d.columns.map((c) => ({
        label: c.label ?? c.name,
        sub: c.derived ? "คำนวณ" : c.kind,
        sortKey: c.derived ? undefined : c.name,
      }));
      const rows: RawRow[] = d.rows.map((r) => ({
        index: null,
        cells: d.columns.map((c) => r[c.name] ?? null),
      }));
      return { columns, rows, total: d.total, title: d.label, subtitle: d.model };
    }
    return null;
  }, [selection, csvQuery.data, dbQuery.data]);

  // คอลัมน์เยอะเกินไป → ซ่อนส่วนเกินไว้ก่อน "พร้อมบอก" และกดเปิดคืนได้
  const autoHiddenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!view || !selection) return;
    const key = selectionKey(selection);
    if (autoHiddenRef.current === key) return;
    autoHiddenRef.current = key;
    if (view.columns.length > AUTO_HIDE_OVER) {
      const next = new Set<number>();
      for (let i = AUTO_SHOW_FIRST; i < view.columns.length; i++) next.add(i);
      setHidden(next);
    } else {
      setHidden(new Set());
    }
  }, [view, selection]);

  const visible = useMemo(() => {
    if (!view) return [];
    return view.columns.map((_, i) => i).filter((i) => !hidden.has(i));
  }, [view, hidden]);

  const loading =
    (selection?.kind === "csv" && csvQuery.isLoading) ||
    (selection?.kind === "db" && dbQuery.isLoading);
  const error =
    (selection?.kind === "csv" ? csvQuery.error : dbQuery.error) ?? null;

  const csvSearch = csvQuery.data?.search ?? null;
  const total = view?.total ?? 0;
  // ตอนค้นหา CSV เราได้แค่ "ผลที่เจอในหน้านี้" ไม่ใช่จำนวนทั้งหมด จึงไม่แบ่งหน้า
  const paging = !(selection?.kind === "csv" && search);
  const from = paging ? page * PAGE_SIZE + 1 : 1;
  const to = paging
    ? Math.min((page + 1) * PAGE_SIZE, total)
    : (view?.rows.length ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sources = sourcesQuery.data;
  const filteredCsv = (sources?.csv ?? []).filter((s) =>
    `${s.label} ${s.fileName} ${s.id}`.toLowerCase().includes(sourceFilter.toLowerCase())
  );
  const filteredDb = (sources?.db ?? []).filter((s) =>
    `${s.label} ${s.model} ${s.group}`.toLowerCase().includes(sourceFilter.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {/* ── เลือกแหล่งข้อมูล ───────────────────────────────────────────────── */}
      {!pickerOpen && selection && view ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          {selection.kind === "csv" ? (
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-teal-600" />
          ) : (
            <Database className="h-4 w-4 shrink-0 text-teal-600" />
          )}
          <span className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {view.title}
          </span>
          <span className="min-w-0 truncate font-mono text-[11px] text-slate-400">
            {view.subtitle}
          </span>
          <span className="ml-auto text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {total.toLocaleString()} แถว
          </span>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            เปลี่ยนแหล่งข้อมูล
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">เลือกแหล่งข้อมูล</CardTitle>
            <CardDescription>
              ไฟล์ที่ sync มาจาก Fabric และตารางในฐานข้อมูลของระบบ — เปิดดูได้ทั้งตาราง
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={tab === "csv" ? "default" : "outline"}
                onClick={() => setTab("csv")}
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                ไฟล์ที่ sync มา ({sources?.csv.length ?? 0})
              </Button>
              <Button
                size="sm"
                variant={tab === "db" ? "default" : "outline"}
                onClick={() => setTab("db")}
              >
                <Database className="mr-1.5 h-3.5 w-3.5" />
                ตารางในระบบ ({sources?.db.length ?? 0})
              </Button>
              <Input
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                placeholder="กรองรายชื่อ…"
                className="h-8 w-full max-w-xs text-sm sm:w-56"
              />
            </div>

            {sourcesQuery.isLoading && (
              <p className="text-sm text-slate-500">กำลังโหลดรายการ…</p>
            )}

            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {tab === "csv"
                ? filteredCsv.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!s.exists}
                      onClick={() => choose({ kind: "csv", id: s.id })}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition-colors",
                        s.exists
                          ? "border-slate-200 hover:border-teal-400 hover:bg-teal-50/60 dark:border-slate-700 dark:hover:border-teal-600 dark:hover:bg-teal-950/30"
                          : "cursor-not-allowed border-dashed border-slate-200 opacity-60 dark:border-slate-700",
                        selection?.kind === "csv" &&
                          selection.id === s.id &&
                          "ring-2 ring-teal-500"
                      )}
                    >
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {s.label}
                      </p>
                      <p className="truncate font-mono text-[10px] text-slate-400">
                        {s.fileName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {s.exists
                          ? `${fmtBytes(s.bytes)} · ${s.columnCount} คอลัมน์${
                              s.rowCount != null
                                ? ` · ${s.rowCount.toLocaleString()} แถว`
                                : ""
                            }`
                          : "ยังไม่มีไฟล์ในเครื่อง"}
                      </p>
                    </button>
                  ))
                : filteredDb.map((s) => (
                    <button
                      key={s.model}
                      type="button"
                      onClick={() => choose({ kind: "db", model: s.model })}
                      className={cn(
                        "rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-teal-400 hover:bg-teal-50/60 dark:border-slate-700 dark:hover:border-teal-600 dark:hover:bg-teal-950/30",
                        selection?.kind === "db" &&
                          selection.model === s.model &&
                          "ring-2 ring-teal-500"
                      )}
                    >
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {s.label}
                      </p>
                      <p className="truncate font-mono text-[10px] text-slate-400">
                        {s.model} · {s.group}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {s.rows != null ? `${s.rows.toLocaleString()} แถว · ` : ""}
                        {s.columnCount} คอลัมน์
                        {s.redacted.length > 0 && ` · ซ่อน ${s.redacted.length}`}
                      </p>
                    </button>
                  ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── แถบเครื่องมือ + ตาราง ──────────────────────────────────────────── */}
      {selection && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ค้นในทุกคอลัมน์…"
                className="h-8 pl-8 text-sm"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="ล้างคำค้น"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setCompact((v) => !v)}
              title={
                compact
                  ? "กลับไปแสดงค่าเต็ม (ค่าที่ยาวจะตกบรรทัดในคอลัมน์)"
                  : "ย่อให้เหลือบรรทัดเดียวต่อเซลล์ เพื่อกวาดตาราง"
              }
            >
              {compact ? "แสดงเต็ม" : "ย่อแถว"}
            </Button>

            <div ref={columnsAnchor}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setColumnsOpen((v) => !v)}
              >
                <Columns3 className="mr-1.5 h-3.5 w-3.5" />
                คอลัมน์ ({visible.length}/{view?.columns.length ?? 0})
              </Button>
            </div>

            <Button
              size="sm"
              variant="outline"
              pending={csvQuery.isFetching || dbQuery.isFetching}
              onClick={() => {
                if (selection.kind === "csv") void csvQuery.refetch();
                else void dbQuery.refetch();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {columnsOpen && view && (
            <AnchoredPanel
              open={columnsOpen}
              anchorRef={columnsAnchor}
              onClose={() => setColumnsOpen(false)}
              reflowKey={view.columns.length}
            >
              <PanelHeader
                title="เลือกคอลัมน์ที่จะแสดง"
                onClose={() => setColumnsOpen(false)}
              />
              <div className="flex gap-2 px-3 pb-2">
                <Button size="sm" variant="outline" onClick={() => setHidden(new Set())}>
                  เลือกทั้งหมด
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setHidden(new Set(view.columns.map((_, i) => i).slice(1)))
                  }
                >
                  เหลือคอลัมน์แรก
                </Button>
              </div>
              <div className="vmi-scroll max-h-72 overflow-y-auto px-3 pb-3">
                {view.columns.map((c, i) => (
                  <label
                    key={i}
                    className="flex cursor-pointer items-center gap-2 py-1 text-sm"
                  >
                    <Checkbox
                      checked={!hidden.has(i)}
                      onCheckedChange={() =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            </AnchoredPanel>
          )}

          {/* คำเตือนที่ต้องเห็นชัด — เงียบไว้แล้วผู้ใช้ตีความข้อมูลผิด */}
          {csvQuery.data?.changed && (
            <NoticeBanner
              tone="info"
              title="ไฟล์ถูก sync ใหม่ระหว่างที่เปิดดูอยู่ — ที่แสดงคือข้อมูลชุดล่าสุดแล้ว"
            />
          )}
          {/* แยกสองสาเหตุให้ชัด — บอกผิดสาเหตุแล้วผู้ใช้แก้ผิดทาง */}
          {csvSearch?.reason === "limit" && (
            <NoticeBanner
              tone="info"
              title={`แสดง ${view?.rows.length.toLocaleString() ?? 0} แถวแรกที่ตรงกับคำค้น (หยุดที่แถว ${csvSearch.scannedRows.toLocaleString()} จาก ${total.toLocaleString()}) — อาจมีมากกว่านี้ พิมพ์ให้เจาะจงขึ้นเพื่อดูให้ครบ`}
            />
          )}
          {csvSearch?.reason === "timeout" && (
            <NoticeBanner
              tone="warn"
              title={`ค้นไม่ครบไฟล์ — หยุดที่แถว ${csvSearch.scannedRows.toLocaleString()} จาก ${total.toLocaleString()} เพราะใช้เวลาเกินกำหนด · ผลที่เห็นยังไม่ใช่ทั้งหมด ลองพิมพ์ให้เจาะจงขึ้น`}
            />
          )}
          {csvQuery.data?.index.ragged && (
            <NoticeBanner
              tone="warn"
              title={`ไฟล์นี้มีแถวที่จำนวนคอลัมน์ไม่เท่าหัวตาราง — หัวตารางมี ${csvQuery.data.index.headers.length} คอลัมน์ แต่แถวข้อมูลมีตั้งแต่ ${csvQuery.data.index.minColumns} ถึง ${csvQuery.data.index.maxColumns} คอลัมน์`}
            />
          )}
          {(csvQuery.data?.truncatedCells ?? 0) > 0 && (
            <NoticeBanner
              tone="info"
              title={`มี ${csvQuery.data?.truncatedCells} เซลล์ที่ยาวเกินกำหนดและถูกตัดท้ายไว้ — กดที่แถวเพื่อดูค่าเต็ม`}
            />
          )}
          {view && view.columns.length > AUTO_HIDE_OVER && hidden.size > 0 && (
            <NoticeBanner
              tone="info"
              title={`แสดง ${visible.length} จาก ${view.columns.length} คอลัมน์ — กด "คอลัมน์" เพื่อเปิดที่เหลือ`}
            />
          )}
          {selection.kind === "csv" && !search && sort.key === null && (
            <p className="px-1 text-[11px] text-slate-400">
              ไฟล์ CSV เรียงตามลำดับในไฟล์จริง (คอลัมน์ # คือเลขแถวในไฟล์)
            </p>
          )}
          {error && (
            <NoticeBanner
              tone="danger"
              title={error instanceof Error ? error.message : String(error)}
            />
          )}

          {loading && !view ? (
            <div className="vmi-table-wrap px-4 py-10 text-center text-sm text-slate-500">
              กำลังอ่านข้อมูล… ไฟล์ใหญ่ครั้งแรกอาจใช้เวลาสักครู่
            </div>
          ) : view ? (
            <>
              <RawTable
                columns={view.columns}
                rows={view.rows}
                visible={visible}
                compact={compact}
                sort={selection.kind === "db" ? sort : undefined}
                onSort={
                  selection.kind === "db"
                    ? (key) =>
                        setSort((prev) =>
                          prev.key === key
                            ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
                            : { key, dir: "asc" }
                        )
                    : undefined
                }
                onRowClick={(row) =>
                  setDetail({
                    rowNumber: row.index != null ? row.index + 1 : null,
                    headers: view.columns.map((c) => c.label),
                    cells: row.cells,
                  })
                }
                emptyText={
                  search
                    ? "ไม่พบแถวที่ตรงกับคำค้นในช่วงที่ค้นไปแล้ว"
                    : "ไม่มีข้อมูลในตารางนี้"
                }
              />

              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="tabular-nums">
                  {paging
                    ? `แสดง ${from.toLocaleString()}–${to.toLocaleString()} จาก ${total.toLocaleString()}`
                    : `พบ ${view.rows.length.toLocaleString()} แถวแรกที่ตรงกับคำค้น`}
                </span>
                {paging && totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      ก่อนหน้า
                    </Button>
                    <span className="tabular-nums">
                      {page + 1} / {totalPages.toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page + 1 >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      ถัดไป
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      <RawRowModal row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
