"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { appPath } from "@/lib/paths";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useVdaOptions } from "@/hooks/use-vda-options";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { useSalesSession } from "@/hooks/use-sales-session";
import { SalesNav } from "@/components/sales/sales-nav";
import { NotifyStoreCheckbox } from "@/components/sales/notify-store-checkbox";
import { PoDetailPanel } from "@/components/sales/po-detail-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import {
  MobileRow,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import { formatBaht, formatNumber } from "@/lib/calculations";
import { formatStoreLabel } from "@/lib/format-store-label";
import {
  PO_STATUSES,
  PO_STATUS_CLASS,
  poStatusMeta,
} from "@/lib/po/po-status";
import { cn } from "@/lib/utils";
import type { PurchaseOrderRow } from "@/app/api/sales/purchase-orders/route";
import { apiFetch } from "@/lib/api-fetch";

const KIND_LABEL: Record<string, string> = {
  c4: "ราคาตรง C4",
  override: "ราคาไม่ตรง C4",
  mixed: "ราคาผสม",
};

const KIND_CLASS: Record<string, string> = {
  c4: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  override:
    "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  mixed:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

const PRICE_KIND_TABS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "c4", label: "ตรง C4" },
  { value: "override", label: "ไม่ตรง C4" },
] as const;

type PoSortKey = "issuedAt" | "amount" | "poNumber";

const PAGE_SIZE = 50;
/** ขีดเดียวกับฝั่ง API — กันเลือกเกินแล้วเจอ 400 ตอนกดโหลด */
const MAX_BULK_EXPORT = 50;

interface PoListResponse {
  items: PurchaseOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    count: number;
    totalQty: number;
    totalAmount: number;
    nonC4Count: number;
  };
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadPo(poNumber: string, format: "xlsx" | "json") {
  const qs = format === "json" ? "?format=json" : "";
  const url = `${appPath(`/api/sales/purchase-orders/${encodeURIComponent(poNumber)}`)}${qs}`;
  window.open(url, "_blank", "noopener");
}

/**
 * PO ที่ออกแล้ว — ปลายทางของออเดอร์ที่อนุมัติ
 *
 * เดิมเลข PO ถูกสร้างแล้วหายไปในไฟล์ JSON ไม่มีหน้าให้ดูย้อนหลังเลย
 * หน้านี้ตอบคำถามที่พนักงานถามจริง: "PO ที่ออกไปวันนี้มีอะไร"
 * และ "ใบไหนที่ราคาไม่ตรง C4 ต้องตามเรื่องกับจัดซื้อ"
 */
export function SalesPoClient() {
  const queryClient = useQueryClient();
  const { session } = useSalesSession();
  // useVdaOptions ดู session ให้แล้ว — vdaReady ครอบทั้ง "มี session" และ "สิทธิ์ VDA มาถึง"
  const {
    availableVdas,
    isAdmin,
    vdaAccess,
    ready: vdaReady,
  } = useVdaOptions();
  const [allPersonVdas, setAllPersonVdas] = useState(false);
  /** เห็นปุ่มนี้เฉพาะเซลล์ที่ถือหลายรหัส — คนที่ถือรหัสเดียวกดไปก็ได้ผลเท่าเดิม */
  const canViewAllPersonVdas =
    !isAdmin &&
    (vdaAccess?.allPersonVdas?.length ?? 0) > 0 &&
    Boolean(vdaAccess?.multipleCodes);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [priceKind, setPriceKind] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<PoSortKey>("issuedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [vda, setVda] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailPo, setDetailPo] = useState<string | null>(null);
  /** ข้อความ error ระดับหน้า — ใช้ร่วมกันทั้งดาวน์โหลด เปลี่ยนสถานะ และลบ */
  const [actionError, setActionError] = useState("");
  /** PO ที่กำลังจะลบทีละใบ (null = ไม่ได้เปิดกล่องยืนยัน) */
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrderRow | null>(
    null
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  /** ค่าเริ่มต้นไม่แจ้ง — หน้านี้ลบเพื่อล้างประวัติเป็นหลัก */
  const [notifyStores, setNotifyStores] = useState(false);

  // ค้นหายิงไป server แล้ว (ครอบทุกหน้า ไม่ใช่แค่แถวที่โหลดมา) — หน่วงกันยิงทุกตัวอักษร
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // เปลี่ยนตัวกรองแล้วต้องกลับหน้า 1 ไม่งั้นค้างอยู่หน้าที่ไม่มีข้อมูลแล้ว
  useEffect(() => {
    setPage(1);
  }, [
    search,
    priceKind,
    dateFrom,
    dateTo,
    sortKey,
    sortDir,
    vda,
    allPersonVdas,
    statusFilter,
  ]);

  const { data, isLoading, isError, refetch } = useQuery<PoListResponse>({
    queryKey: [
      "sales-purchase-orders",
      {
        priceKind,
        search,
        dateFrom,
        dateTo,
        sortKey,
        sortDir,
        page,
        vda,
        allPersonVdas,
        statusFilter,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (priceKind !== "all") params.set("priceKind", priceKind);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      // ทั้งสองอย่างพร้อมกันไม่มีความหมาย — "ทุก VDA" กว้างกว่าเสมอ
      if (allPersonVdas) params.set("allPersonVdas", "true");
      else if (vda) params.set("vdaCode", vda);
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const res = await apiFetch(
        `${appPath("/api/sales/purchase-orders")}?${params.toString()}`
      );
      if (!res.ok) throw new Error(`โหลด PO ไม่สำเร็จ (${res.status})`);
      return res.json();
    },
    // รอสิทธิ์ VDA ให้พร้อมก่อน ไม่งั้นยิงซ้ำเมื่อ session/scope มาถึงทีหลัง
    enabled: vdaReady,
    placeholderData: (prev) => prev,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageAllSelected =
    items.length > 0 && items.every((po) => selected.has(po.poNumber));

  function toggleOne(poNumber: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(poNumber)) next.delete(poNumber);
      else next.add(poNumber);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const po of items) next.delete(po.poNumber);
      } else {
        for (const po of items) next.add(po.poNumber);
      }
      return next;
    });
  }

  function toggleSort(key: PoSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  /** โหลดหลายใบเป็นไฟล์เดียว — ใช้ blob เพื่อให้เห็นสถานะและ error เป็นข้อความ */
  const bulkExport = useAsyncAction(async () => {
    setActionError("");
    const poNumbers = [...selected].slice(0, MAX_BULK_EXPORT);
    if (poNumbers.length === 0) return;
    const res = await apiFetch(appPath("/api/sales/purchase-orders/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poNumbers }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      setActionError(
        typeof body?.error === "string"
          ? body.error
          : `ดาวน์โหลดไม่สำเร็จ (${res.status})`
      );
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PO-${poNumbers.length}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  });

  /**
   * ลบ PO — เซิร์ฟเวอร์ลบออเดอร์ต้นทางทั้งใบ ไม่ใช่แค่แถว PO
   * จึงคืน `deletedPoNumbers` ที่อาจมากกว่าที่เลือกไว้ (PO พี่น้องของออเดอร์เดียวกัน)
   */
  async function runDelete(poNumbers: string[]) {
    setActionError("");
    const params = new URLSearchParams({ poNumbers: poNumbers.join(",") });
    if (!notifyStores) params.set("notify", "0");
    const res = await apiFetch(
      `${appPath("/api/sales/purchase-orders")}?${params.toString()}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      setActionError(
        typeof body?.error === "string"
          ? body.error
          : `ลบไม่สำเร็จ (${res.status})`
      );
      return;
    }
    const body = (await res.json()) as { deletedPoNumbers?: string[] };
    const gone = new Set(body.deletedPoNumbers ?? poNumbers);
    // ล้างเฉพาะใบที่หายจริง — ใบที่ไม่มีสิทธิ์ลบยังติ๊กค้างไว้ให้เห็นว่าตกหล่น
    setSelected((prev) => new Set([...prev].filter((n) => !gone.has(n))));
    // ออเดอร์ต้นทางหายไปด้วย — หน้าตรวจออเดอร์และ badge จำนวนที่รออนุมัติต้องรู้
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["sales-pending-count"] });
    await refetch();
  }

  /** เปลี่ยนสถานะ PO — โหลดรายการใหม่หลังสำเร็จเพื่อให้ตัวกรองสถานะสอดคล้อง */
  async function changeStatus(poNumber: string, status: string) {
    setStatusBusy(poNumber);
    setActionError("");
    try {
      const res = await apiFetch(
        appPath(`/api/sales/purchase-orders/${encodeURIComponent(poNumber)}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        setActionError(
          typeof b?.error === "string"
            ? b.error
            : `เปลี่ยนสถานะไม่สำเร็จ (${res.status})`
        );
        return;
      }
      await refetch();
    } finally {
      setStatusBusy(null);
    }
  }

  const sortIndicator = (key: PoSortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <PageShell>
      <AppHeader
        compact
        wide
        title="ใบสั่งซื้อ (PO)"
        subtitle="PO ที่ออกจากออเดอร์ที่อนุมัติแล้ว"
        role={session?.role ?? "sales"}
      />

      {/* ตาราง 10 คอลัมน์ — ใช้ความกว้างเดียวกับหน้าตรวจออเดอร์ ให้สองหน้าฝั่งเซลล์เท่ากัน */}
      <main className="mx-auto w-full max-w-[min(100%,96rem)] space-y-3 px-3 py-3 sm:px-4">
        <SalesNav />

        {/* สรุปคิดจากผลกรองทั้งหมด ไม่ใช่แค่หน้าที่เปิดอยู่ */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="PO ทั้งหมด"
            value={formatNumber(summary?.count ?? 0, 0)}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="รวม (หีบ)"
            value={formatNumber(summary?.totalQty ?? 0, 0)}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="มูลค่ารวม"
            value={formatBaht(summary?.totalAmount ?? 0)}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="ราคาไม่ตรง C4"
            value={formatNumber(summary?.nonC4Count ?? 0, 0)}
            tone={(summary?.nonC4Count ?? 0) > 0 ? "amber" : "default"}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหาเลข PO / รหัสคลัง / ชื่อร้าน..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div
            role="group"
            aria-label="กรองตามราคา"
            className="flex shrink-0 rounded-xl border border-slate-200 p-1 dark:border-slate-700"
          >
            {PRICE_KIND_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setPriceKind(t.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  priceKind === t.value
                    ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-slate-500">
            สถานะ
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">ทั้งหมด</option>
              {PO_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {canViewAllPersonVdas && (
            <Button
              size="sm"
              variant={allPersonVdas ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => {
                setAllPersonVdas((v) => !v);
                setVda("");
              }}
              title="ดู PO ของทุก VDA ที่คุณดูแล ไม่ต้องสลับรหัสเซลล์"
            >
              ทุก VDA ของฉัน
            </Button>
          )}
          {availableVdas.length > 0 && !allPersonVdas && (
            <label className="flex items-center gap-1.5 text-slate-500">
              คลัง
              <select
                value={vda}
                onChange={(e) => setVda(e.target.value)}
                className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">
                  {isAdmin ? "ทุก VDA" : "ทุก VDA ที่ดูแล"}
                </option>
                {availableVdas.map((v) => (
                  <option key={v} value={v}>
                    {v.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5 text-slate-500">
            ออกเมื่อ
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-auto py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-500">
            ถึง
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-auto py-1 text-xs"
            />
          </label>
          {(dateFrom || dateTo || vda || allPersonVdas) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setVda("");
                setAllPersonVdas(false);
              }}
            >
              ล้างตัวกรอง
            </Button>
          )}

          {selected.size > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-slate-500">เลือก {selected.size} ใบ</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setSelected(new Set())}
              >
                ล้าง
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => bulkExport.run()}
                disabled={bulkExport.pending}
              >
                {bulkExport.pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                ดาวน์โหลด Excel รวม
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={() => setBulkDeleteOpen(true)}
                title="ลบ PO ที่เลือก พร้อมออเดอร์ต้นทาง"
              >
                <Trash2 className="h-3.5 w-3.5" />
                ลบ {selected.size} ใบ
              </Button>
            </div>
          )}
        </div>

        {selected.size > MAX_BULK_EXPORT && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            เลือกไว้ {selected.size} ใบ — ดาวน์โหลดรวมได้ครั้งละ{" "}
            {MAX_BULK_EXPORT} ใบ ระบบจะเอา {MAX_BULK_EXPORT} ใบแรกเท่านั้น
          </p>
        )}
        {(actionError || bulkExport.error) && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {actionError || bulkExport.error}
          </p>
        )}

        {isLoading && (
          <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด...</p>
        )}
        {isError && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <span>โหลด PO ไม่สำเร็จ</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              ลองใหม่
            </Button>
          </div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {search || dateFrom || dateTo || priceKind !== "all"
                ? "ไม่พบ PO ตามตัวกรอง"
                : "ยังไม่มี PO ที่ออก"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              PO จะถูกสร้างเมื่ออนุมัติออเดอร์ที่หน้า &quot;ตรวจออเดอร์&quot;
            </p>
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* เดสก์ท็อป */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 lg:block">
              <table className="vmi-data-table w-full text-left">
                <thead>
                  <tr>
                    <th className="w-8 px-2 py-2">
                      <Checkbox
                        checked={pageAllSelected}
                        onCheckedChange={toggleAllOnPage}
                        aria-label="เลือก PO ทั้งหน้า"
                      />
                    </th>
                    <th
                      className="cursor-pointer px-3 py-2 select-none"
                      onClick={() => toggleSort("poNumber")}
                      title="เรียงตามเลข PO"
                    >
                      เลข PO{sortIndicator("poNumber")}
                    </th>
                    <th className="px-3 py-2">ร้าน / คลัง</th>
                    <th className="px-3 py-2">ประเภทราคา</th>
                    <th className="px-3 py-2">สถานะ</th>
                    <th className="px-3 py-2 text-right">รายการ</th>
                    <th className="px-3 py-2 text-right">หีบ</th>
                    <th
                      className="cursor-pointer px-3 py-2 text-right select-none"
                      onClick={() => toggleSort("amount")}
                      title="เรียงตามมูลค่า"
                    >
                      มูลค่า{sortIndicator("amount")}
                    </th>
                    <th
                      className="cursor-pointer px-3 py-2 select-none"
                      onClick={() => toggleSort("issuedAt")}
                      title="เรียงตามวันที่ออก"
                    >
                      ออกเมื่อ{sortIndicator("issuedAt")}
                    </th>
                    <th className="w-[12%] px-3 py-2">โดย</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((po) => (
                    <tr
                      key={po.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      onClick={() => setDetailPo(po.poNumber)}
                    >
                      <td
                        className="px-2 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected.has(po.poNumber)}
                          onCheckedChange={() => toggleOne(po.poNumber)}
                          aria-label={`เลือก ${po.poNumber}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {po.poNumber}
                        </span>
                        {po.siblingCount > 1 && (
                          <span
                            className="ml-1.5 text-[11px] text-slate-400"
                            title={`ออเดอร์นี้แบ่งเป็น ${po.siblingCount} PO`}
                          >
                            แบ่ง {po.siblingCount} ใบ
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {formatStoreLabel(po.storeCode, po.storeName)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1",
                            KIND_CLASS[po.priceKind] ?? KIND_CLASS.mixed
                          )}
                        >
                          {KIND_LABEL[po.priceKind] ?? po.priceKind}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={po.status}
                          disabled={statusBusy === po.poNumber}
                          onChange={(e) =>
                            void changeStatus(po.poNumber, e.target.value)
                          }
                          title={poStatusMeta(po.status).hint}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 outline-none",
                            PO_STATUS_CLASS[poStatusMeta(po.status).tone] ??
                              PO_STATUS_CLASS.slate
                          )}
                        >
                          {PO_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(po.itemCount, 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(po.totalQty, 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatBaht(po.totalAmount)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {fmtDateTime(po.issuedAt)}
                      </td>
                      {/* truncate บน <td> ไม่มีผล (display: table-cell) —
                          ต้องตัดที่ <div> ข้างในและมีความกว้างจาก <th> คุมไว้ */}
                      <td className="max-w-0 px-3 py-2 text-slate-500">
                        <div className="truncate" title={po.issuedBy || ""}>
                          {po.issuedBy || "—"}
                        </div>
                      </td>
                      <td
                        className="px-3 py-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => downloadPo(po.poNumber, "xlsx")}
                          >
                            <Download className="h-3.5 w-3.5" />
                            Excel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            title="ดูข้อมูลดิบที่ส่งต่อฝ่ายจัดซื้อ"
                            onClick={() => downloadPo(po.poNumber, "json")}
                          >
                            JSON
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                            title="ลบ PO ใบนี้พร้อมออเดอร์ต้นทาง"
                            onClick={() => setDeleteTarget(po)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* มือถือ */}
            <MobileRowList grid className="lg:hidden">
              {items.map((po) => (
                <MobileRow key={po.id} warn={po.priceKind !== "c4"}>
                  <MobileRowTop>
                    <div className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={selected.has(po.poNumber)}
                        onCheckedChange={() => toggleOne(po.poNumber)}
                        aria-label={`เลือก ${po.poNumber}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                          {po.poNumber}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {formatStoreLabel(po.storeCode, po.storeName)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                          KIND_CLASS[po.priceKind] ?? KIND_CLASS.mixed
                        )}
                      >
                        {KIND_LABEL[po.priceKind] ?? po.priceKind}
                      </span>
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                          PO_STATUS_CLASS[poStatusMeta(po.status).tone] ??
                            PO_STATUS_CLASS.slate
                        )}
                      >
                        {poStatusMeta(po.status).label}
                      </span>
                    </div>
                  </MobileRowTop>
                  <MobileRowStats>
                    <MobileStat
                      label="รายการ"
                      value={formatNumber(po.itemCount, 0)}
                    />
                    <MobileStat
                      label="หีบ"
                      value={formatNumber(po.totalQty, 0)}
                      highlight
                    />
                    <MobileStat label="มูลค่า" value={formatBaht(po.totalAmount)} />
                    <MobileStat label="ออกเมื่อ" value={fmtDateTime(po.issuedAt)} />
                  </MobileRowStats>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-xs"
                      onClick={() => setDetailPo(po.poNumber)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      ดูรายละเอียด
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-xs"
                      onClick={() => downloadPo(po.poNumber, "xlsx")}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Excel
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => downloadPo(po.poNumber, "json")}
                    >
                      JSON
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                      aria-label={`ลบ ${po.poNumber}`}
                      onClick={() => setDeleteTarget(po)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </MobileRow>
              ))}
            </MobileRowList>

            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                แสดง {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)} จาก{" "}
                {formatNumber(total, 0)} รายการ
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  ก่อนหน้า
                </Button>
                <span className="px-2 tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  ถัดไป
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </main>

      {detailPo && (
        <PoDetailPanel poNumber={detailPo} onClose={() => setDetailPo(null)} />
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        title={`ลบ PO ${deleteTarget?.poNumber ?? ""}?`}
        body={
          deleteTarget && (
            <>
              <p>
                ออเดอร์ต้นทางของ{" "}
                <span className="font-medium">
                  {formatStoreLabel(
                    deleteTarget.storeCode,
                    deleteTarget.storeName
                  )}
                </span>{" "}
                จะถูกลบทั้งใบ ({deleteTarget.itemCount} รายการ ·{" "}
                {formatBaht(deleteTarget.totalAmount)})
              </p>
              {deleteTarget.siblingCount > 1 && (
                <p className="mt-1.5 font-semibold text-amber-700 dark:text-amber-400">
                  ออเดอร์นี้แบ่งเป็น {deleteTarget.siblingCount} PO — ใบพี่น้อง
                  อีก {deleteTarget.siblingCount - 1} ใบจะถูกลบไปด้วย
                </p>
              )}
              <p className="mt-1.5">
                ประวัติที่ร้านเห็นในหน้า &quot;ประวัติการสั่งซื้อ&quot;
                และแจ้งเตือนเดิมของออเดอร์นี้จะถูกลบด้วย · ย้อนกลับไม่ได้
              </p>
              <NotifyStoreCheckbox
                checked={notifyStores}
                onChange={setNotifyStores}
              />
            </>
          )
        }
        confirmLabel="ลบ PO"
        onConfirm={async () => {
          if (deleteTarget) await runDelete([deleteTarget.poNumber]);
        }}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`ลบ PO ที่เลือก ${selected.size} ใบ?`}
        body={
          <>
            <p>
              ระบบจะลบออเดอร์ต้นทางของทุกใบที่เลือก — รายการสินค้า เลข PO
              ประวัติที่ร้านเห็น และแจ้งเตือนเดิมของออเดอร์เหล่านั้นจะหายทั้งหมด
            </p>
            <p className="mt-1.5 font-semibold text-amber-700 dark:text-amber-400">
              ถ้าออเดอร์ไหนแบ่งเป็นหลาย PO ใบพี่น้องที่ไม่ได้เลือกจะถูกลบด้วย
            </p>
            <p className="mt-1.5">ย้อนกลับไม่ได้</p>
            <NotifyStoreCheckbox
              checked={notifyStores}
              onChange={setNotifyStores}
            />
          </>
        }
        confirmLabel={`ลบ ${selected.size} ใบ`}
        onConfirm={async () => {
          await runDelete([...selected]);
        }}
        onClose={() => setBulkDeleteOpen(false)}
      />
    </PageShell>
  );
}
