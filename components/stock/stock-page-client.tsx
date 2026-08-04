"use client";

import { appPath } from "@/lib/paths";
import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useDataVersion } from "@/hooks/use-data-version";
import { StockSummaryInline } from "@/components/stock/stock-summary-inline";
import { StockQtyStepper } from "@/components/stock/stock-qty-stepper";
import { cvdFlagHint } from "@/lib/stock/cvd-hint";
import { StockPromoView } from "@/components/stock/stock-promo-view";
import { buildPromoBuckets } from "@/lib/promo/promo-browse";
import {
  BROWSE_MODE_STORAGE_KEY,
  DEFAULT_STOCK_BROWSE_MODE,
  isStockBrowseMode,
  type StockBrowseMode,
} from "@/lib/stock/browse-mode";
import {
  ShoppingCart,
  BarChart3,
  Ban,
  Sparkles,
  CalendarOff,
  Check,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  History,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  buildPromoInspectorProps,
  PromoDetailCell,
} from "@/components/promo/promo-detail-cell";
import {
  buildGroupMemberSkusMap,
  PromoGroupHeader,
} from "@/components/promo/promo-group-header";
import {
  FreeGoodMobileCard,
  FreeGoodStockTableRow,
} from "@/components/promo/free-good-subrow";
import { ProductSalesPanel } from "@/components/stock/product-sales-panel";
import { StopOrderModal } from "@/components/stock/stop-order-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  StockToolbar,
  type StockViewCounts,
} from "@/components/stock/stock-toolbar";
import {
  StockAvgSalesCell,
  StockCaseCell,
  StockDiscountPerCaseCell,
  StockListPriceCell,
  StockNetPriceCell,
} from "@/components/stock/stock-price-cells";
import { FlagBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MobileRow,
  MobileRowExtra,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import { cn, looksLikeProductCodeQuery, matchesProductSearch } from "@/lib/utils";
import {
  formatDays,
  formatNumber,
  getOrderCvdFlag,
  isBenefitTier,
  type CvdFlag,
  type CvdFlagReason,
  type OrderCvdResult,
} from "@/lib/calculations";
import {
  DEFAULT_STOCK_SORT,
  isStockSortKey,
  sortStockRows,
  type StockSortKey,
  type StockSortState,
} from "@/lib/stock/sort";
import {
  DEFAULT_STOCK_FILTERS,
  filterStockRows,
  isCriticalStock,
  isStockView,
  type StockFilterState,
} from "@/lib/stock/filters";
import {
  annotatePromoGroupStripes,
  followsPooledPromoGroup,
  promoGroupBorderClass,
  type PromoGroupStripe,
} from "@/lib/promo/promo-group-display";
import {
  enrichStockRowsWithPooledPromo,
  isFreeGoodHostRow,
  buildSuggestByProduct,
  mapGroupStagedToMemberSkus,
  mapStagedQtyToSkuCodes,
} from "@/lib/promo/stock-pooled-promo";
import type { StockRowComputed } from "@/lib/repositories/types";

interface StockPageClientProps {
  storeCode: string;
  storeName: string;
  storeAddress?: string;
  isVda?: boolean;
}

interface StockApiResponse {
  sources: string[];
  activeFromDb: string | null;
  filterMode: string | null;
  dataDate: string | null;
  rows: StockRowComputed[];
}

function isStockPayload(data: unknown): data is StockApiResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "rows" in data &&
    Array.isArray((data as StockApiResponse).rows)
  );
}

/** ความสูงแถวเริ่มต้น (px) — ต้องตรงกับ --vmi-row-h ใน globals.css */
const DEFAULT_ROW_PX = 48;

// v2 = เปลี่ยนค่าเริ่มต้นเป็นรหัสสินค้าน้อยไปมาก — ต้องเปลี่ยนคีย์
// ไม่งั้นเครื่องที่เคยเปิดหน้านี้จะยังโดน sort เดิม (desc) ที่ค้างใน sessionStorage ทับ
const SORT_STORAGE_KEY = "vmi_stock_sort_v2";
const FILTER_STORAGE_KEY = "vmi_stock_filters";

/** query ที่ต้องล้างเมื่อชุดข้อมูลกลางเปลี่ยน — ประกาศนอกคอมโพเนนต์ให้ reference คงที่ */
const STOCK_INVALIDATE_KEYS = [
  ["stock"],
  ["sales-daily"],
  ["order-history-recent"],
  ["promo-assorted-names"],
] as const;

type DisplayRow = StockRowComputed & {
  promoGroupStripe?: PromoGroupStripe | null;
  promoGroupIsFirst?: boolean;
};

export function StockPageClient({
  storeCode,
  storeName,
  storeAddress,
  isVda = false,
}: StockPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<StockFilterState>(DEFAULT_STOCK_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [stopOpen, setStopOpen] = useState(false);
  const [confirmRiskyOpen, setConfirmRiskyOpen] = useState(false);
  const [sort, setSort] = useState<StockSortState>(DEFAULT_STOCK_SORT);
  const [mode, setMode] = useState<StockBrowseMode>(DEFAULT_STOCK_BROWSE_MODE);
  const [sessionReady, setSessionReady] = useState(false);
  const [pendingFocusSku, setPendingFocusSku] = useState<string | null>(null);

  // ข้อมูลกลาง sync ทุกเช้า — แท็บที่เปิดค้างต้องรู้เองไม่ต้องรอคนกดปุ่ม
  useDataVersion(STOCK_INVALIDATE_KEYS);

  const { data, isLoading, isError, refetch } = useQuery<StockApiResponse>({
    queryKey: ["stock"],
    queryFn: async () => {
      const res = await fetch(appPath("/api/stock"), { cache: "no-store" });
      if (!res.ok) throw new Error(`โหลดสต็อกไม่สำเร็จ (${res.status})`);
      const raw = await res.json();
      if (isStockPayload(raw)) return raw;
      return {
        sources: [],
        activeFromDb: null,
        filterMode: null,
        dataDate: null,
        rows: Array.isArray(raw) ? raw : [],
      };
    },
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  /** สรุปที่เคยสั่งไปแล้วใน 14 วัน — ใช้เตือนกันสั่งซ้ำ (โหลดแยกจาก payload สต็อก) */
  const { data: recentOrders } = useQuery<{
    days: number;
    bySku: Record<string, RecentOrderSummary>;
  }>({
    queryKey: ["order-history-recent"],
    queryFn: async () => {
      const res = await fetch(
        appPath("/api/store/order-history?summary=1&days=14"),
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("โหลดประวัติการสั่งไม่สำเร็จ");
      return res.json();
    },
    staleTime: 60_000,
  });
  const recentBySku = recentOrders?.bySku ?? EMPTY_RECENT;

  /** true = desktop table (≥1024px); false = mobile/card list */
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  // map รหัสสินค้า -> จำนวนแนะนำสั่ง สำหรับ mark "แนะนำซื้อ" ใน modal โปรกลุ่ม
  const suggestByProduct = useMemo(() => buildSuggestByProduct(rows), [rows]);
  const activeVda = data?.activeFromDb ?? storeCode;
  const dataDate = data?.dataDate ?? null;
  // header ของหน้านี้เป็นแบบ compact (ซ่อนบล็อกชื่อร้าน) จึงต่อชื่อร้านเข้ากับ title เอง
  const headerTitle = useMemo(() => {
    const base = `สต็อก · ${activeVda.toUpperCase()}`;
    const name = storeName?.trim();
    if (!name || name.toUpperCase() === activeVda.toUpperCase()) return base;
    return `${base} · ${name}`;
  }, [activeVda, storeName]);

  /** จำการเรียงลำดับ + ตัวกรองที่ผู้ใช้เลือกไว้ข้ามการรีเฟรชหน้า */
  useEffect(() => {
    try {
      const rawSort = sessionStorage.getItem(SORT_STORAGE_KEY);
      if (rawSort) {
        const saved = JSON.parse(rawSort) as StockSortState;
        if (isStockSortKey(saved?.key) && (saved.dir === "asc" || saved.dir === "desc")) {
          setSort(saved);
        }
      }
      const rawFilters = sessionStorage.getItem(FILTER_STORAGE_KEY);
      if (rawFilters) {
        const saved = JSON.parse(rawFilters) as Partial<StockFilterState>;
        setFilters({
          view: isStockView(saved?.view) ? saved.view : "all",
          brand: typeof saved?.brand === "string" ? saved.brand : null,
          section: typeof saved?.section === "string" ? saved.section : null,
          hideNoSales: saved?.hideNoSales === true,
        });
      }
      const rawMode = sessionStorage.getItem(BROWSE_MODE_STORAGE_KEY);
      if (isStockBrowseMode(rawMode)) setMode(rawMode);
    } catch {
      // ignore corrupt session
    }
  }, []);

  /**
   * ส่งออก Excel ตามตัวกรอง/การเรียงที่เห็นบนจอ (สร้างไฟล์ฝั่ง server)
   *
   * โหลดเป็น blob แทน window.location.href — ได้สถานะ "กำลังสร้างไฟล์" จริง,
   * error ขึ้นเป็นข้อความแทนการพาไปหน้า JSON เปล่า และกดซ้ำระหว่างสร้างไม่ได้
   */
  const exportAction = useAsyncAction(async (scope: "all" | "selected" = "all") => {
    setRefreshMsg("");
    // จำนวนที่ผู้ใช้แก้บนหน้าจอต้องไปอยู่ในไฟล์ — เดิมส่งแค่ตัวกรอง/การเรียง
    // ทำให้ไฟล์ได้ suggestOrder ของระบบ ไม่ใช่สิ่งที่ผู้ใช้ตั้งไว้
    // qtyOverrides คีย์ด้วย skuId แต่ฝั่ง server จับคู่ด้วย skuCode
    const codeById = new Map(rows.map((r) => [r.skuId, r.skuCode]));
    const qtyPairs: string[] = [];
    for (const [skuId, n] of Object.entries(qtyOverrides)) {
      const code = codeById.get(skuId);
      const qty = Math.floor(n);
      if (code && qty > 0) qtyPairs.push(`${code}:${qty}`);
    }

    const body: Record<string, string> = {
      // โหมดโปรบังคับเรียงแบบกลุ่มโปร ให้ไฟล์ออกมาจัดกลุ่มเหมือนที่เห็นบนจอ
      sort: mode === "promo" ? "promoGroup" : sort.key,
      dir: sort.dir,
    };
    if (filters.brand) body.brand = filters.brand;
    if (filters.section) body.section = filters.section;
    if (filters.view !== "all") body.view = filters.view;
    if (filters.hideNoSales) body.hideNoSales = "1";
    const q = search.trim();
    if (q) body.search = q;
    if (qtyPairs.length > 0) body.qty = qtyPairs.join(",");
    if (scope === "selected") {
      body.onlySelected = "1";
      body.selected = rows
        .filter((r) => selected.has(r.skuId))
        .map((r) => r.skuCode)
        .join(",");
    }

    // POST เสมอ — รายการจำนวนที่แก้ไว้ยาวเกินกว่าจะใส่ใน URL ได้ปลอดภัย
    const res = await fetch(appPath("/api/stock/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`ส่งออกไฟล์ไม่สำเร็จ (${res.status})`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match
      ? decodeURIComponent(match[1])
      : `vmi-stock-${storeCode}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, { onError: (msg) => setRefreshMsg(msg) });

  const exportExcel = exportAction.run;

  /** ยกเลิกหยุดสั่ง — เดิมไม่มี pending และเงียบสนิทเมื่อ server ปฏิเสธ */
  const unblockAction = useAsyncAction(
    async (skuId: string) => {
      const res = await fetch(appPath("/api/store/blocklist"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuIds: [skuId] }),
      });
      if (!res.ok) throw new Error(`ยกเลิกการหยุดสั่งไม่สำเร็จ (${res.status})`);
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      setRefreshMsg("ยกเลิกการหยุดสั่งแล้ว");
    },
    { onError: (msg) => setRefreshMsg(msg) }
  );

  const applySort = useCallback((next: StockSortState) => {
    setSort(next);
    try {
      sessionStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sessionStorage เต็ม/ถูกปิด — เรียงได้ต่อ แค่ไม่จำ
    }
  }, []);

  const applyMode = useCallback((next: StockBrowseMode) => {
    setMode(next);
    // "สต็อกวิกฤต" นิยามด้วย CVD ล้วน — ในโหมดโปรที่ไม่แสดง CVD มันจะซ่อนสินค้า
    // ไปเงียบ ๆ โดยผู้ใช้ไม่มีทางรู้ว่าทำไม จึงรีเซ็ตกลับเป็น "ทั้งหมด"
    if (next === "promo") {
      setFilters((prev) =>
        prev.view === "critical" ? { ...prev, view: "all" } : prev
      );
    }
    try {
      sessionStorage.setItem(BROWSE_MODE_STORAGE_KEY, next);
    } catch {
      // ไม่จำโหมด — ใช้งานได้ปกติ
    }
  }, []);

  const applyFilters = useCallback((next: StockFilterState) => {
    setFilters(next);
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sessionStorage เต็ม/ถูกปิด — กรองได้ต่อ แค่ไม่จำ
    }
  }, []);

  /** คลิกหัวคอลัมน์เพื่อเรียง — กดซ้ำคีย์เดิม = สลับทิศทาง */
  const toggleColumnSort = useCallback(
    (key: StockSortKey, firstDir: "asc" | "desc" = "asc") => {
      applySort(
        sort.key === key
          ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
          : { key, dir: firstDir }
      );
    },
    [applySort, sort]
  );

  /** คืนค่าการเลือก + จำนวนจาก session เมื่อกลับจากหน้า order */
  useEffect(() => {
    if (rows.length === 0 || sessionReady) return;
    try {
      const rawDraft = sessionStorage.getItem("vmi_order_draft");
      const rawQty = sessionStorage.getItem("vmi_order_qty");
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as StockRowComputed[];
        if (Array.isArray(draft) && draft.length > 0) {
          const ids = draft
            .map((r) => r.skuId)
            .filter((id) => rows.some((r) => r.skuId === id));
          if (ids.length > 0) setSelected(new Set(ids));
        }
      }
      if (rawQty) {
        const qtyMap = JSON.parse(rawQty) as Record<string, number>;
        if (qtyMap && typeof qtyMap === "object") {
          const valid: Record<string, number> = {};
          for (const r of rows) {
            const q = qtyMap[r.skuCode];
            if (q != null && q > 0) valid[r.skuCode] = Math.floor(q);
          }
          if (Object.keys(valid).length > 0) setQtyOverrides(valid);
        }
      }
    } catch {
      // ignore corrupt session
    } finally {
      setSessionReady(true);
    }
  }, [rows, sessionReady]);

  /** จำนวนต่อ SKU สำหรับจำลอง promotion group (override จาก modal ได้) */
  const promoStagedQty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const o = qtyOverrides[r.skuCode];
      if (o != null) {
        m[r.skuCode] = Math.max(0, Math.floor(o));
      } else if (r.suggestOrder > 0) {
        m[r.skuCode] = r.suggestOrder;
      }
    }
    return m;
  }, [rows, qtyOverrides]);

  const enrichedPrevRef = useRef<StockRowComputed[]>([]);
  const stagedPrevRef = useRef<Record<string, number>>({});

  const enrichedRows = useMemo(() => {
    const prevStaged = stagedPrevRef.current;
    const changed = new Set<string>();
    const codes = new Set([
      ...Object.keys(promoStagedQty),
      ...Object.keys(prevStaged),
    ]);
    for (const code of codes) {
      if ((promoStagedQty[code] ?? 0) !== (prevStaged[code] ?? 0)) {
        changed.add(code);
      }
    }
    const next = enrichStockRowsWithPooledPromo(rows, promoStagedQty, {
      previous: enrichedPrevRef.current,
      changedSkuCodes: changed,
    });
    enrichedPrevRef.current = next;
    stagedPrevRef.current = promoStagedQty;
    return next;
  }, [rows, promoStagedQty]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim();
    const skuLookup = looksLikeProductCodeQuery(q);
    let out = enrichedRows;
    if (q) {
      out = out.filter((r) => matchesProductSearch(q, r));
    }
    // ค้นหารหัส SKU ตรง ๆ — ไม่กรองซ้อน (กัน filter ค้างทำให้ไม่เจอ)
    if (skuLookup) return out;
    return filterStockRows(out, filters);
  }, [enrichedRows, deferredSearch, filters]);

  function toggleExpand(skuId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
  }

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await fetch(appPath("/api/stock/refresh"), { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        queued?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setRefreshMsg(
          data.message ?? data.error ?? "ตรวจข้อมูลไม่สำเร็จ — แสดง cache"
        );
      } else {
        // queued = ข้อมูลกลางเก่าจนต้องดึงใหม่จาก Fabric ซึ่งกินเวลาเป็นนาที
        // ห้ามบอกว่า "อัปเดตแล้ว" — useDataVersion จะ invalidate ให้เองเมื่อเสร็จจริง
        setRefreshMsg(data.message ?? "ข้อมูลเป็นชุดล่าสุดแล้ว");
      }
    } catch {
      setRefreshMsg("ตรวจข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      // รีเฟรชยอดขายรายวันในแผงที่กางอยู่ด้วย (เดิม module cache ไม่ถูกล้าง)
      await queryClient.invalidateQueries({ queryKey: ["sales-daily"] });
      await queryClient.invalidateQueries({ queryKey: ["data-version"] });
      setRefreshing(false);
    }
  }, [refreshing, queryClient]);

  // แถบสี/แถวหัวกลุ่มโปรใช้ได้ต่อเมื่อแถวในกลุ่มเดียวกันติดกัน — จริงเฉพาะตอนเรียงแบบ "กลุ่มโปรโมชั่น"
  // เรียงแบบอื่นจึงปิดแถบสีไว้ ไม่งั้นสีจะสลับมั่วทั้งตาราง
  const displayRows = useMemo(() => {
    const sorted = sortStockRows(filtered, sort.key, sort.dir);
    if (sort.key === "promoGroup") return annotatePromoGroupStripes(sorted);
    return sorted.map((row) => ({
      ...row,
      promoGroupStripe: null as PromoGroupStripe | null,
      promoGroupIsFirst: false,
    }));
  }, [filtered, sort]);

  // สร้างจากแถวทั้งหมดที่ร้านมี ไม่ใช่แถวที่ผ่านตัวกรอง — "SKU ในกลุ่มที่ร้านนี้มีของ"
  // เป็นข้อเท็จจริงของคลัง ไม่ควรเปลี่ยนตามการค้นหา/กรองที่เปิดอยู่
  // (ไม่งั้นเปิดโมดัลโปรกลุ่มตอนค้นหาอยู่ จะเห็นสมาชิกแค่ตัวเดียวและรวมยอดโปรผิด)
  const groupMemberSkusMap = useMemo(
    () => buildGroupMemberSkusMap(enrichedRows),
    [enrichedRows]
  );

  /** กลุ่มโปรที่ให้สิทธิประโยชน์จริง — C4 มีกลุ่มที่จับสินค้าไว้ด้วยกันแต่ ladder ลด 0
   *  กลุ่มพวกนั้นไม่ต้องมีปุ่มดูโปร เพราะกดเข้าไปก็ไม่มีอะไรให้ดู */
  const benefitGroups = useMemo(() => {
    const set = new Set<string>();
    for (const r of enrichedRows) {
      const g = r.promoGroup?.trim();
      if (!g || set.has(g)) continue;
      if ((r.promoTiers ?? []).some(isBenefitTier)) set.add(g);
    }
    return set;
  }, [enrichedRows]);

  /** ถังโปรสำหรับโหมด "โปรโมชั่น" — สมาชิก/ยอดรวมจาก enrichedRows, แถวที่โชว์จาก displayRows */
  const promoBuckets = useMemo(() => {
    if (mode !== "promo") return [];
    return buildPromoBuckets(enrichedRows, displayRows);
  }, [mode, enrichedRows, displayRows]);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  // ความสูงจริงของแผงที่กางออก ต่อ skuId — วัดด้วย ResizeObserver แล้ว feed เข้า estimateSize
  const expandedHeights = useRef<Map<string, number>>(new Map());
  // โหมดโปรเป็นการ์ดซ้อนกัน ไม่ใช่ลิสต์ <tr> แบน — virtualizer ที่ประเมินความสูง
  // จากตารางเดียวใช้ไม่ได้ ต้องปิดไว้ ไม่งั้น estimateSize จะ index แถวที่ไม่มีใน DOM
  const shouldVirtualize =
    mode === "list" && isDesktop && !isLoading && displayRows.length >= 40;
  // ความสูงแถวมาจาก --vmi-row-h ใน globals.css (แหล่งความจริงเดียว)
  // 48 เป็นแค่ fallback ก่อน DOM พร้อม
  const rowBasePx = useRef(DEFAULT_ROW_PX);
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? displayRows.length : 0,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: (index) => {
      const base = rowBasePx.current;
      const row = displayRows[index];
      if (!row) return base;
      let h = base;
      // สัดส่วนเดิมวัดจากหน้าจริงที่ความสูงแถว 48px — สเกลตามฐานใหม่
      if (row.promoGroupIsFirst && row.promoGroupStripe != null) {
        h += Math.round(base * 0.71);
      }
      if (isFreeGoodHostRow(displayRows, index)) h += base;
      // ใช้ความสูงที่วัดได้จริง (ถ้ามี) แทนค่าคงที่ — กัน scroll กระโดดตอน expand / toggle 7↔30
      if (expanded.has(row.skuId)) h += expandedHeights.current.get(row.skuId) ?? 220;
      return h;
    },
    overscan: 10,
  });

  useEffect(() => {
    const el = tableScrollRef.current?.closest(".vmi-stock-main");
    const raw = el
      ? getComputedStyle(el).getPropertyValue("--vmi-row-h")
      : "";
    const px = parseFloat(raw);
    rowBasePx.current = Number.isFinite(px) && px > 0 ? px : DEFAULT_ROW_PX;
    // re-measure หลังอ่านค่าจริง — ไม่งั้นแถวจะซ้อนหรือขาดที่ breakpoint ที่ --vmi-row-h ต่างกัน
    if (shouldVirtualize) rowVirtualizer.measure();
  }, [isDesktop, shouldVirtualize, rowVirtualizer]);
  const virtualItems = shouldVirtualize
    ? rowVirtualizer.getVirtualItems()
    : null;

  // อัปเดตความสูงแผงที่กางออกจาก ResizeObserver แล้ว re-measure virtualizer (ใช้ ref ไม่ trigger re-render)
  const measureExpanded = useCallback(
    (skuId: string, height: number) => {
      const prev = expandedHeights.current.get(skuId);
      if (prev == null || Math.abs(prev - height) > 2) {
        expandedHeights.current.set(skuId, height);
        if (shouldVirtualize) rowVirtualizer.measure();
      }
    },
    [rowVirtualizer, shouldVirtualize]
  );

  useEffect(() => {
    if (shouldVirtualize) rowVirtualizer.measure();
  }, [expanded, shouldVirtualize, displayRows, rowVirtualizer]);

  /** เลื่อนขึ้นบนเมื่อค้นหา/กรองเปลี่ยน — กัน virtual scroll ค้างล่างแล้วมองไม่เห็นผลลัพธ์ */
  useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
    if (shouldVirtualize) {
      rowVirtualizer.scrollToOffset(0);
    }
  }, [deferredSearch, filters, shouldVirtualize, rowVirtualizer]);

  /** โฟกัส SKU จากหน้า order (กดรหัสสินค้า) */
  useEffect(() => {
    if (!sessionReady) return;
    try {
      const focus = sessionStorage.getItem("vmi_focus_sku");
      if (!focus) return;
      sessionStorage.removeItem("vmi_focus_sku");
      setSearch(focus);
      setFilters(DEFAULT_STOCK_FILTERS);
      setPendingFocusSku(focus);
    } catch {
      /* ignore */
    }
  }, [sessionReady]);

  useEffect(() => {
    if (!pendingFocusSku || isLoading) return;
    const idx = displayRows.findIndex(
      (r) =>
        r.skuCode === pendingFocusSku ||
        r.skuCode.replace(/^0+/, "") === pendingFocusSku.replace(/^0+/, "")
    );
    if (idx < 0) return;

    if (shouldVirtualize) {
      rowVirtualizer.scrollToIndex(idx, { align: "center" });
    } else {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-sku-code="${CSS.escape(pendingFocusSku)}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
    setPendingFocusSku(null);
  }, [
    pendingFocusSku,
    displayRows,
    isLoading,
    shouldVirtualize,
    rowVirtualizer,
  ]);

  /** จำนวนของแต่ละมุมมอง — นับจากข้อมูลดิบทั้งหมด ไม่ให้ตัวเลขบนแท็บกระพริบตามตัวกรองอื่น
   *  (สต็อกวิกฤต = จะหมดก่อนถึงจำนวนวันขั้นต่ำ ทั้งที่ยังมีการขาย → เสี่ยงขาดสต็อก) */
  const viewCounts: StockViewCounts = useMemo(() => {
    let needs = 0;
    let critical = 0;
    let fresh = 0;
    let noSales = 0;
    for (const r of enrichedRows) {
      if (r.needsOrder) needs++;
      if (isCriticalStock(r)) critical++;
      if (r.isNew) fresh++;
      if (r.noSales30) noSales++;
    }
    return {
      all: enrichedRows.length,
      needs,
      critical,
      new: fresh,
      noSales,
    };
  }, [enrichedRows]);

  function unblock(skuId: string) {
    if (unblockAction.pending) return;
    if (!confirm("ยกเลิกการหยุดสั่งสินค้านี้?")) return;
    unblockAction.run(skuId);
  }

  const [promoApplyVersion, setPromoApplyVersion] = useState(0);

  const applyGroupStaged = useCallback(
    (staged: Record<string, number>, memberSkus?: string[]) => {
      const mapped =
        memberSkus && memberSkus.length > 0
          ? mapGroupStagedToMemberSkus(rows, memberSkus, staged)
          : mapStagedQtyToSkuCodes(rows, staged);
      setQtyOverrides((prev) => ({ ...prev, ...mapped }));
      setPromoApplyVersion((v) => v + 1);
    },
    [rows]
  );

  const resolveLineQty = useCallback(
    (row: StockRowComputed) => {
      const o = qtyOverrides[row.skuCode];
      if (o != null) return Math.max(0, Math.floor(o));
      return row.suggestOrder > 0 ? row.suggestOrder : 0;
    },
    [qtyOverrides]
  );

  function defaultLineQty(row: StockRowComputed): number {
    return row.suggestOrder > 0 ? row.suggestOrder : 0;
  }

  function lineQty(row: StockRowComputed): number {
    return resolveLineQty(row);
  }

  /** จำนวนที่ใช้ประเมิน CVD — เฉพาะเมื่อมีการสั่งจริงหรือมีแนะนำ */
  function evalQty(row: StockRowComputed): number {
    const o = qtyOverrides[row.skuCode];
    if (o != null) return Math.max(0, Math.floor(o));
    if (selected.has(row.skuId)) return lineQty(row);
    if (row.suggestOrder > 0) return row.suggestOrder;
    return 0;
  }

  function orderCvdFlag(row: StockRowComputed): OrderCvdResult {
    return getOrderCvdFlag(
      row.stock,
      evalQty(row),
      row.avgSales,
      row.minDays,
      row.maxDays
    );
  }

  /** ปรับจำนวนเท่านั้น — ไม่ติ๊กเลือกอัตโนมัติ */
  function setLineQty(skuCode: string, qty: number) {
    const nextQty = Math.max(0, Math.floor(qty));
    setQtyOverrides((prev) => ({
      ...prev,
      [skuCode]: nextQty,
    }));
  }

  function resetLineQty(skuCode: string) {
    setQtyOverrides((prev) => {
      if (!(skuCode in prev)) return prev;
      const next = { ...prev };
      delete next[skuCode];
      return next;
    });
  }

  function adjustLineQty(skuCode: string, delta: number) {
    const row = rows.find((r) => r.skuCode === skuCode);
    if (!row) return;
    setLineQty(skuCode, lineQty(row) + delta);
  }

  function initQtyForRow(row: StockRowComputed) {
    setQtyOverrides((prev) => {
      if (prev[row.skuCode] != null) return prev;
      return {
        ...prev,
        [row.skuCode]: defaultLineQty(row),
      };
    });
  }

  function toggleRow(skuId: string) {
    const row = rows.find((r) => r.skuId === skuId);
    const adding = !selected.has(skuId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });
    if (adding && row) initQtyForRow(row);
  }

  /**
   * แถวที่ปุ่ม "เลือกทั้งหมด" บนหัวตารางจะกวาด — ตัดสินจาก "จำนวนที่จะสั่งจริง"
   * ไม่ใช่ needsOrder อย่างเดียว จึงครอบทุกเจตนาของผู้ใช้ด้วยเงื่อนไขเดียว
   *
   *   ระบบแนะนำ ไม่ได้แตะ      → suggestOrder > 0  ✅
   *   ไม่แนะนำ แต่ตั้งจำนวนเอง → override > 0      ✅ (เดิมตกหล่น)
   *   ไม่แนะนำ ไม่ได้แตะ        → 0                ❌
   *   แนะนำ แต่ตั้งเป็น 0 เอง   → 0                ❌ ผู้ใช้บอกชัดว่าไม่เอา
   *
   * เคสสุดท้ายสำคัญ: เดิมเลือกแถวนั้นด้วย แล้วไปติด selectedZeroQtyCount
   * ซึ่งปิดปุ่ม "ตรวจสอบคำสั่ง" — กดเลือกทั้งหมดแล้วส่งออเดอร์ไม่ได้โดยไม่รู้สาเหตุ
   */
  const selectableRows = useMemo(
    () => filtered.filter((r) => resolveLineQty(r) > 0),
    [filtered, resolveLineQty]
  );

  /** เฉพาะที่ระบบแนะนำ — ใช้กับปุ่ม "เลือกที่ควรสั่ง" ที่แถบล่าง
   *  (คนละความหมายกับ selectableRows ข้างบน ป้ายปุ่มก็บอกต่างกัน) */
  const filteredNeedsOrder = useMemo(
    () => filtered.filter((r) => r.needsOrder),
    [filtered]
  );

  const allSelectableSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.skuId));

  const someSelectableSelected =
    selectableRows.some((r) => selected.has(r.skuId)) && !allSelectableSelected;

  function toggleSelectAllNeeds() {
    if (allSelectableSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        selectableRows.forEach((r) => next.delete(r.skuId));
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      selectableRows.forEach((r) => next.add(r.skuId));
      return next;
    });
    // ตรึงค่าที่แนะนำให้เป็นค่าจริงในดราฟต์ — แถวที่ผู้ใช้ตั้งเองมีค่าอยู่แล้ว ไม่ทับ
    setQtyOverrides((prev) => {
      const next = { ...prev };
      for (const r of selectableRows) {
        if (next[r.skuCode] == null) {
          next[r.skuCode] = r.suggestOrder > 0 ? r.suggestOrder : 0;
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  /** เลือกทุกแถวที่เห็นบนจอ — ใช้กับแท็บ "ไม่ขาย 1 เดือน" เพื่อกดหยุดสั่งรวดเดียว
   *  (ต่างจาก selectByFilter ที่เลือกเฉพาะรายการที่ควรสั่ง ซึ่งของไม่ขายแทบไม่เข้าเงื่อนไข) */
  function selectAllDisplayed() {
    setSelected(new Set(displayRows.map((r) => r.skuId)));
  }

  /** คืนจำนวนทุกรายการเป็นที่แนะนำ (ไม่เปลี่ยนการเลือก) */
  function resetAllQtyToSuggested() {
    setQtyOverrides({});
  }

  /** เลือกที่ควรสั่งตามตัวกรองปัจจุบัน (replace ไม่สะสม) */
  function selectByFilter(section?: string) {
    let target = filteredNeedsOrder;
    if (section) {
      target = target.filter((r) => (r.section ?? "") === section);
    }
    setSelected(new Set(target.map((r) => r.skuId)));
    setQtyOverrides((prev) => {
      const next = { ...prev };
      for (const r of target) {
        if (next[r.skuCode] == null) {
          next[r.skuCode] = r.suggestOrder > 0 ? r.suggestOrder : 0;
        }
      }
      return next;
    });
  }

  /** จำนวนรายการที่ผู้ใช้แก้จำนวนเอง — ใช้เปิด/ปิดเมนู "รีเซ็ตจำนวนเป็นค่าแนะนำ" */
  const adjustedCount = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      const o = qtyOverrides[r.skuCode];
      if (o != null && o !== (r.suggestOrder > 0 ? r.suggestOrder : 0)) n++;
    }
    return n;
  }, [rows, qtyOverrides]);

  /** รายการ Section / Brand สำหรับแผงกรอง */
  const filterSections = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.section) s.add(r.section);
    return [...s].sort((a, b) => a.localeCompare(b, "th"));
  }, [rows]);

  const filterBrands = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.brand) s.add(r.brand);
    return [...s].sort((a, b) => a.localeCompare(b, "th"));
  }, [rows]);

  const stats = useMemo(() => {
    let totalStock = 0;
    let totalStockExact = 0;
    let totalValue = 0;
    let totalAvg = 0;
    let needsOrder = 0;
    for (const r of rows) {
      // หน่วยหีบทั้งหมด — stockCases (หีบเต็ม) สำหรับแสดง, stock (ทศนิยม) สำหรับมูลค่า/CVD
      totalStock += r.stockCases;
      totalStockExact += r.stock;
      totalValue += r.stock * (r.unitPrice ?? 0);
      totalAvg += r.avgSales;
      if (r.needsOrder) needsOrder++;
    }
    const cvdAll = totalAvg > 0 ? totalStockExact / totalAvg : null;
    return {
      total: rows.length,
      totalStock,
      totalValue,
      cvdAll,
      needsOrder,
    };
  }, [rows]);

  const selectedItems = useMemo(
    () => rows.filter((r) => selected.has(r.skuId)),
    [rows, selected]
  );

  const selectedSkuCodes = useMemo(
    () => new Set(selectedItems.map((r) => r.skuCode)),
    [selectedItems]
  );

  /**
   * คำเตือนเมื่อจำนวนที่สั่งไม่เหมาะสม — ใช้ในโหมดโปรที่ไม่มีคอลัมน์ CVD
   *
   * footer ยังกั้นการส่งด้วยกฎเดิม แต่ถ้าไม่มีอะไรบอกว่าแถวไหนผิด ผู้ใช้จะหาไม่เจอ
   * ข้อความที่คืนเป็นประโยคสั่งการล้วน ไม่มีตัวเลข CVD ให้ต้องตีความ
   */
  const blockedQtyHint = useCallback(
    (row: StockRowComputed): string | null => {
      const { flag, reason, blocking } = getOrderCvdFlag(
        row.stock,
        resolveLineQty(row),
        row.avgSales,
        row.minDays,
        row.maxDays
      );
      // เดิมโชว์เฉพาะเคสที่กั้นการส่ง — เคส outOfStock/minPack ที่ "สั่งได้"
      // ก็ต้องอธิบายด้วย ไม่งั้นผู้ใช้เห็นธงแดงแล้วไม่รู้ว่าทำอะไรได้
      void blocking;
      if (flag == null || reason == null) return null;
      return cvdFlagHint(flag, reason, row);
    },
    [resolveLineQty]
  );

  /** รายการที่จำนวนไม่เหมาะสมจนต้องกั้นก่อนส่งออเดอร์
   *  — ไม่นับเคส minPack (สั่ง 1 หีบซึ่งเป็นขั้นต่ำ แล้ว CVD สูงเพราะของขายช้า) */
  const selectedRedCount = useMemo(() => {
    let n = 0;
    for (const item of selectedItems) {
      const { blocking } = getOrderCvdFlag(
        item.stock,
        resolveLineQty(item),
        item.avgSales,
        item.minDays,
        item.maxDays
      );
      if (blocking) n++;
    }
    return n;
  }, [selectedItems, resolveLineQty]);

  const selectedZeroQtyCount = useMemo(
    () => selectedItems.filter((item) => resolveLineQty(item) <= 0).length,
    [selectedItems, resolveLineQty]
  );

  useEffect(() => {
    if (!sessionReady) return;
    const timer = window.setTimeout(() => {
      if (selectedItems.length === 0) {
        sessionStorage.removeItem("vmi_order_draft");
        sessionStorage.removeItem("vmi_order_qty");
        // ราคาที่ร้านแก้ไว้ผูกกับ draft นี้ — เคลียร์พร้อมกันไม่งั้นไปเกาะออเดอร์ถัดไป
        sessionStorage.removeItem("vmi_order_price");
        return;
      }
      // เก็บเฉพาะฟิลด์ที่หน้า order ต้องใช้ — ลด JSON ใหญ่ทุกครั้งที่เลือก/เปลี่ยนจำนวน
      const draft = selectedItems.map((r) => ({
        ...r,
        promoTiers: r.promoTiers?.length ? r.promoTiers : [],
      }));
      sessionStorage.setItem("vmi_order_draft", JSON.stringify(draft));
      const qtyMap: Record<string, number> = {};
      for (const item of selectedItems) {
        qtyMap[item.skuCode] = resolveLineQty(item);
      }
      sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [sessionReady, selectedItems, qtyOverrides, resolveLineQty]);

  function goToOrder() {
    if (selectedItems.length === 0) return;
    sessionStorage.setItem("vmi_order_draft", JSON.stringify(selectedItems));
    const qtyMap: Record<string, number> = {};
    for (const item of selectedItems) {
      qtyMap[item.skuCode] = resolveLineQty(item);
    }
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
    router.push("/order");
  }

  return (
    <PageShell className="vmi-stock-page pb-20">
      <AppHeader
        compact
        wide
        title={headerTitle}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main
        className="vmi-stock-main mx-auto w-full min-w-0 max-w-none px-3 pt-2 sm:px-4 lg:px-6"
      >
        <StockSummaryInline
          summary={{
            total: stats.total,
            totalStock: stats.totalStock,
            totalValue: stats.totalValue,
            cvdAll: stats.cvdAll,
            promoGroups: promoBuckets.filter((b) => b.kind === "group").length,
          }}
          mode={mode}
          dataDate={dataDate ? formatDataDate(dataDate) : null}
          refreshing={refreshing}
          statusMsg={
            exportAction.pending
              ? { text: "กำลังสร้างไฟล์ Excel…", tone: "info" }
              : refreshMsg
                ? {
                    text: refreshMsg,
                    tone:
                      refreshMsg.includes("ไม่สำเร็จ") ||
                      refreshMsg.includes("cache")
                        ? "warn"
                        : "info",
                  }
                : null
          }
          onRefresh={handleRefresh}
        />

        <StockToolbar
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={applyFilters}
          counts={viewCounts}
          shownCount={displayRows.length}
          brands={filterBrands}
          sections={filterSections}
          sort={sort}
          onSortChange={applySort}
          onExport={exportExcel}
          onResetQty={resetAllQtyToSuggested}
          onClearSelection={clearSelection}
          selectedCount={selected.size}
          adjustedCount={adjustedCount}
          mode={mode}
          onModeChange={applyMode}
          hiddenViews={mode === "promo" ? ["critical"] : undefined}
        />

        {isError && (
          <div className="mx-2 mb-2 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <span>โหลดข้อมูลสต็อกไม่สำเร็จ</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700"
            >
              ลองใหม่
            </button>
          </div>
        )}

        <div className="vmi-table-wrap vmi-stock-table-wrap min-h-0 flex-1 max-lg:flex-none">
          <div
            ref={tableScrollRef}
            className="vmi-table-scroll vmi-stock-table-scroll overflow-x-hidden"
          >
            {mode === "promo" ? (
              isLoading ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  กำลังโหลด...
                </p>
              ) : (
                <StockPromoView
                  buckets={promoBuckets}
                  storeCode={activeVda}
                  stagedQty={promoStagedQty}
                  suggestByProduct={suggestByProduct}
                  selectedSkuIds={selected}
                  selectedSkuCodes={selectedSkuCodes}
                  qtyOf={lineQty}
                  blockedQtyHint={blockedQtyHint}
                  promoApplyVersion={promoApplyVersion}
                  onToggleRow={toggleRow}
                  onSetQty={setLineQty}
                  onAdjustQty={adjustLineQty}
                  onResetQty={resetLineQty}
                  onConfirmStaged={applyGroupStaged}
                />
              )
            ) : !isDesktop ? (
            <div>
              {isLoading ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  กำลังโหลด...
                </p>
              ) : displayRows.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {deferredSearch.trim()
                    ? `ไม่พบสินค้าที่ตรงกับ "${deferredSearch.trim()}"`
                    : "ไม่มีรายการตามตัวกรอง"}
                </p>
              ) : (
                <MobileRowList grid>
                  {displayRows.map((row, index) => {
                    const { cvdEst, flag, reason } = orderCvdFlag(row);
                    return (
                    <StockMobileRow
                      key={row.skuId}
                      row={row}
                      afterPromoGroup={followsPooledPromoGroup(displayRows, index)}
                      storeCode={activeVda}
                      qty={lineQty(row)}
                      selected={selected.has(row.skuId)}
                      orderCvd={cvdEst}
                      orderFlag={flag}
                      orderCvdReason={reason}
                      stagedQty={promoStagedQty}
                      suggestByProduct={suggestByProduct}
                      onConfirmStaged={applyGroupStaged}
                      promoApplyVersion={promoApplyVersion}
                      groupMemberSkus={
                        row.promoGroup
                          ? groupMemberSkusMap.get(row.promoGroup) ?? [
                              row.skuCode,
                            ]
                          : [row.skuCode]
                      }
                      groupHasBenefit={
                        row.promoGroup
                          ? benefitGroups.has(row.promoGroup.trim())
                          : false
                      }
                      onAdjustQty={(d) => adjustLineQty(row.skuCode, d)}
                      onSetQty={(q) => setLineQty(row.skuCode, q)}
                      onApplySuggest={() => resetLineQty(row.skuCode)}
                      onToggle={() => toggleRow(row.skuId)}
                      expanded={expanded.has(row.skuId)}
                      onToggleExpand={() => toggleExpand(row.skuId)}
                      showFreeGoodRow={isFreeGoodHostRow(displayRows, index)}
                      recentOrder={recentBySku[row.skuCode]}
                    />
                    );
                  })}
                </MobileRowList>
              )}
            </div>
            ) : (
            <table className="vmi-data-table vmi-stock-fit-table w-full table-fixed text-left">
            {/* ชื่อสินค้า 21% — วัดจากข้อมูลจริงแล้วชื่อที่ยาวสุดใช้ ~271px พอดีหนึ่งบรรทัด
                ที่เหลือยกให้คอลัมน์โปร (19%) ซึ่งต้องวาง 3 บรรทัดของข้อมูลโปร

                ⚠️ ความกว้างอิง "ตำแหน่ง" ไม่ใช่ชื่อคอลัมน์ — ย้ายคอลัมน์เมื่อไหร่
                ต้องย้าย <col> ให้ตรงกันทุกครั้ง ไม่งั้นความกว้างสลับมั่วทั้งตาราง */}
            <colgroup>
              <col className="w-[2.5%]" /> {/* checkbox */}
              <col className="w-[6.5%]" /> {/* SKU */}
              <col className="w-[21%]" /> {/* ชื่อสินค้า */}
              <col className="w-[5%]" /> {/* สต็อก */}
              <col className="w-[5.5%]" /> {/* ขายเฉลี่ย */}
              <col className="w-[4.5%]" /> {/* CVD */}
              <col className="w-[5%]" /> {/* MIN / MAX */}
              <col className="w-[5%]" /> {/* ราคา/หีบ */}
              <col className="w-[5%]" /> {/* ส่วนลด */}
              <col className="w-[5.5%]" /> {/* ราคาสุทธิ/หีบ */}
              <col className="w-[19%]" /> {/* โปร */}
              <col className="w-[9%]" /> {/* จำนวนสั่ง */}
              <col className="w-[6.5%]" /> {/* CVD หลังสั่ง */}
            </colgroup>
            <thead className="font-medium text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-1 py-2">
                  <Checkbox
                    checked={
                      allSelectableSelected
                        ? true
                        : someSelectableSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleSelectAllNeeds}
                    aria-label="เลือกทุกรายการที่มีจำนวนสั่งในตาราง"
                    title="เลือกทุกรายการที่มีจำนวนสั่ง — ทั้งที่ระบบแนะนำ และที่คุณปรับจำนวนเอง (ตามตัวกรอง)"
                  />
                </th>
                <SortableTh
                  label="SKU"
                  sortKey="code"
                  sort={sort}
                  onSort={toggleColumnSort}
                  title="เรียงตามรหัสสินค้า"
                />
                <SortableTh
                  label="ชื่อสินค้า"
                  sortKey="name"
                  sort={sort}
                  onSort={toggleColumnSort}
                  title="เรียงตามชื่อสินค้า"
                />
                <SortableTh
                  label="สต็อก"
                  sub="หีบ/เศษ"
                  align="right"
                  sortKey="stock"
                  sort={sort}
                  onSort={toggleColumnSort}
                  title="คงเหลือหน่วยหีบ · เศษที่ไม่ครบหีบ (ชิ้น) — แปลงจาก qty_available ด้วย PackingSize · กดเพื่อเรียง"
                />
                <SortableTh
                  label="ขายเฉลี่ย"
                  sub="7 วัน · หีบ (ชิ้น)"
                  align="right"
                  sortKey="avgSales"
                  firstDir="desc"
                  sort={sort}
                  onSort={toggleColumnSort}
                  title="ขายเฉลี่ยต่อวัน 7 วัน จาก stock_cover (avg_qty_out_L7) หน่วยหีบ — ไม่ใช่ยอดบิล factsales · กดเพื่อเรียง"
                />
                <SortableTh
                  label="CVD"
                  align="right"
                  sortKey="cvd"
                  sort={sort}
                  onSort={toggleColumnSort}
                  title="จำนวนวันที่สินค้าเพียงพอ — กดเพื่อเรียงเอาของที่ใกล้หมดขึ้นก่อน"
                />
                <th
                  className="px-1 py-2 text-right"
                  title="เป้าหมาย CVD ต่ำสุด / สูงสุด (วัน) ตามที่ตั้งในหน้าจัดการ"
                >
                  MIN / MAX
                </th>
                <th className="px-1 py-2 text-right">ราคา/หีบ</th>
                <th className="px-1 py-2 text-right">ส่วนลด</th>
                {/* ตัวเลขชิดขวาชนข้อความโปรที่ชิดซ้าย — เว้นช่องให้ห่างขึ้น
                    เขียน pl/pr แยกแทน px-1 เพราะ px กับ pl ทับกันเองตามลำดับ CSS */}
                <th className="py-2 pl-1 pr-2 text-right">ราคาสุทธิ/หีบ</th>
                <th className="py-2 pl-3 pr-1">โปร</th>
                <SortableTh
                  label="จำนวนสั่ง"
                  align="center"
                  sortKey="suggest"
                  firstDir="desc"
                  sort={sort}
                  onSort={toggleColumnSort}
                  title="จำนวนที่ระบบแนะนำ — กดเพื่อเรียงจากมากไปน้อย"
                />
                <th
                  className="px-1 py-2 text-center"
                  title="CVD หลังของเข้า — เกิน MAX ได้ไม่เกิน 4 วันยังถือว่าเหมาะสม"
                >
                  CVD หลังสั่ง
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!isLoading && displayRows.length === 0 && (
                <tr>
                  <td
                    colSpan={13}
                    className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    {deferredSearch.trim()
                      ? `ไม่พบสินค้าที่ตรงกับ "${deferredSearch.trim()}"`
                      : "ไม่มีรายการตามตัวกรอง"}
                  </td>
                </tr>
              )}
              {!isLoading && displayRows.length > 0 && (
                <>
                  {virtualItems && (virtualItems[0]?.start ?? 0) > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={13}
                        style={{
                          height: virtualItems[0]!.start,
                          padding: 0,
                          border: "none",
                        }}
                      />
                    </tr>
                  )}
                  {(virtualItems
                    ? virtualItems.map((v) => ({
                        row: displayRows[v.index]!,
                        index: v.index,
                      }))
                    : displayRows.map((row, index) => ({ row, index }))
                  ).map(({ row, index }) => {
                  const lowStock =
                    row.needsOrder ||
                    (row.stockCvd !== null && row.stockCvd < row.minDays);
                  const isExpanded = expanded.has(row.skuId);
                  const { cvdEst, flag, reason: cvdReason } = orderCvdFlag(row);
                  const showFreeGoodRow = isFreeGoodHostRow(displayRows, index);
                  const afterPromoGroup = followsPooledPromoGroup(displayRows, index);
                  return (
                    <Fragment key={row.skuId}>
                    {row.promoGroupIsFirst && row.promoGroupStripe != null && row.promoGroup && (
                      <tr className="border-t border-slate-100 dark:border-slate-800">
                        <td colSpan={13} className="px-2 pb-1.5 pt-2.5">
                          <PromoGroupHeader
                            promoGroup={row.promoGroup}
                            stripe={row.promoGroupStripe}
                            storeCode={activeVda}
                            hostSkuCode={row.skuCode}
                            memberSkus={
                              groupMemberSkusMap.get(row.promoGroup) ?? [
                                row.skuCode,
                              ]
                            }
                            stagedQty={promoStagedQty}
                            suggestByProduct={suggestByProduct}
                            onConfirmStaged={applyGroupStaged}
                            applyVersion={promoApplyVersion}
                            showPromoButton={benefitGroups.has(
                              row.promoGroup.trim()
                            )}
                            tiers={row.promoTiers}
                            endsInDays={row.currentPromoEndsInDays}
                          />
                        </td>
                      </tr>
                    )}
                    <tr
                      data-sku-code={row.skuCode}
                      className={cn(
                        "border-t border-slate-100 text-slate-800 transition-colors dark:border-slate-800 dark:text-slate-200",
                        afterPromoGroup &&
                          "border-t-2 border-t-slate-300 dark:border-t-slate-600",
                        // กลุ่มโปร = แถบตั้งซ้าย · ไม่กินพื้นหลัง
                        promoGroupBorderClass(row.promoGroupStripe),
                        // พื้นหลัง = สถานะของแถว ชั้นเดียว มีลำดับชัดเจน
                        // เขียนเป็น ternary ไม่ใช่ซ้อน class เพราะ bg-* หลายตัวบน element เดียว
                        // จะให้ผลตามลำดับ CSS ของ Tailwind ไม่ใช่ลำดับที่เขียนตรงนี้
                        //
                        // สี hover ต้องอยู่ในก้อนเดียวกับสีพื้นด้วย — เดิมมี hover:bg-slate-50/60
                        // อยู่ใน class พื้นฐาน ซึ่ง :hover มี specificity สูงกว่า bg-* ธรรมดา
                        // เลยทับสีสถานะเป็นขาวทุกครั้งที่ชี้เมาส์ มองไม่ออกว่าเลือกไว้แล้ว
                        selected.has(row.skuId)
                          ? "bg-teal-100 hover:bg-teal-200 dark:bg-teal-900/40 dark:hover:bg-teal-900/60"
                          : flag === "red"
                            ? "bg-red-50/70 hover:bg-red-100/80 dark:bg-red-950/25 dark:hover:bg-red-950/40"
                            : lowStock
                              ? "bg-amber-100/80 hover:bg-amber-200/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/35"
                              : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                      )}
                    >
                      <td className="px-1 py-1.5">
                        <Checkbox
                          checked={selected.has(row.skuId)}
                          onCheckedChange={() => toggleRow(row.skuId)}
                        />
                      </td>
                      <td className="truncate px-1 py-1.5 font-medium text-slate-900 dark:text-slate-100">
                        <div className="truncate text-xs">{row.skuCode}</div>
                        {row.barcode && (
                          <div className="truncate font-mono vmi-t-xs font-normal text-slate-400 dark:text-slate-500">
                            {row.barcode}
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-1.5 align-middle text-slate-700 dark:text-slate-300">
                        {/* ป้ายสถานะแยกบรรทัดบน — ชื่อสินค้าจึงได้ความกว้างเต็มคอลัมน์
                            (เดิมป้ายแย่งที่กับชื่อ ทำให้ชื่อโดนตัดตั้งแต่กลางคำ) */}
                        <div className="flex min-w-0 flex-wrap items-center gap-1 empty:hidden">
                          {row.isNew && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-sky-100 px-1 py-0.5 vmi-t-xs font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                              title="สินค้าใหม่ในระบบ"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              ใหม่
                            </span>
                          )}
                          {row.blocked && (
                            <button
                              type="button"
                              onClick={() => unblock(row.skuId)}
                              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-red-100 px-1 py-0.5 vmi-t-xs font-bold text-red-700 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300"
                              title={`${formatBlockTitle(row)} — กดเพื่อยกเลิก`}
                            >
                              <Ban className="h-2.5 w-2.5" />
                              หยุดสั่ง
                            </button>
                          )}
                          {recentBySku[row.skuCode] && (
                            <OrderedBadge info={recentBySku[row.skuCode]!} />
                          )}
                          {row.noSales30 && !row.blocked && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-200 px-1 py-0.5 vmi-t-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                              title="ไม่มียอดขายใน 1 เดือนที่ผ่านมา"
                            >
                              <CalendarOff className="h-2.5 w-2.5" />
                              ไม่ขาย 1 ด.
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={cn(
                            "group flex w-full min-w-0 items-start gap-1 text-left hover:text-teal-700 dark:hover:text-teal-400",
                            expanded.has(row.skuId) &&
                              "font-medium text-teal-700 dark:text-teal-400"
                          )}
                          onClick={() => toggleExpand(row.skuId)}
                          title={row.skuName}
                        >
                          {/* ชื่อยาวห่อได้ 2 บรรทัด — ยาวกว่านั้นค่อยตัด (ยังอ่านเต็มได้จาก tooltip) */}
                          <span className="line-clamp-2 min-w-0 break-words text-xs leading-snug">
                            {row.skuName}
                          </span>
                          <BarChart3
                            className={cn(
                              "mt-px h-3 w-3 shrink-0 text-slate-300 group-hover:text-teal-600 dark:text-slate-600",
                              expanded.has(row.skuId) && "text-teal-600 dark:text-teal-400"
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-1 py-1.5 text-right text-xs">
                        <StockCaseCell
                          cases={row.stockCases}
                          remainder={row.stockRemainder}
                          pieces={row.stockPieces}
                          packSize={row.packSize}
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right text-xs">
                        <StockAvgSalesCell
                          avgCases={row.avgQtyOutL7 ?? row.avgSales}
                          packSize={row.packSize}
                          compact
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-xs">
                        {formatDays(row.stockCvd)}
                      </td>
                      <td
                        className="px-1 py-1.5 text-right tabular-nums vmi-t-sm text-slate-500 dark:text-slate-400"
                        title={`เป้าหมาย CVD ${row.minDays}–${row.maxDays} วัน`}
                      >
                        {row.minDays}/{row.maxDays} วัน
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <StockListPriceCell
                          unitPrice={row.unitPrice}
                          expired={row.priceExpired}
                          compact
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <StockDiscountPerCaseCell
                          discountBaht={row.discountBahtPerCase}
                          discountPct={row.discountPctPerCase}
                          compact
                        />
                      </td>
                      <td className="py-1.5 pl-1 pr-2 text-right">
                        <StockNetPriceCell
                          unitPrice={row.unitPrice}
                          netUnitPrice={row.netUnitPrice}
                          expired={row.priceExpired}
                          compact
                        />
                      </td>
                      <td className="max-w-0 overflow-hidden py-1.5 pl-3 pr-1 align-top">
                        <div className="min-w-0">
                          <PromoDetailCell
                            variant="compact"
                            currentPromo={row.currentPromo}
                            currentKind={row.currentPromoKind}
                            nextPromo={row.nextPromo}
                            qtyToNext={row.qtyToNext}
                            nextPromoQty={row.nextPromoQty}
                            nextKind={row.nextPromoKind}
                            freeGood={row.freeGood}
                            showFreeGoodChip={false}
                            hasPromoLadder={row.hasPromoLadder}
                            tiers={row.promoTiers}
                            endsInDays={row.currentPromoEndsInDays}
                            onApplyNext={(qty) =>
                              setLineQty(row.skuCode, qty)
                            }
                            muted={row.suggestOrder <= 0}
                            // เรียงแบบกลุ่มโปรมีแถวหัวกลุ่ม + แถบสีบอกอยู่แล้ว ไม่ต้องซ้ำ
                            showGroupChip={row.promoGroupStripe == null}
                            inspector={buildPromoInspectorProps(row, {
                              storeCode: activeVda,
                              stagedQty: promoStagedQty,
                              memberSkus: row.promoGroup
                                ? groupMemberSkusMap.get(row.promoGroup)
                                : undefined,
                              onConfirmStaged: applyGroupStaged,
                              suggestByProduct,
                            })}
                          />
                        </div>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <StockQtyStepper
                          qty={lineQty(row)}
                          suggestOrder={row.suggestOrder}
                          onMinus={() => adjustLineQty(row.skuCode, -1)}
                          onPlus={() => adjustLineQty(row.skuCode, 1)}
                          onSetQty={(q) => setLineQty(row.skuCode, q)}
                          onApplySuggest={() => resetLineQty(row.skuCode)}
                          compact
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {flag ? (
                          <div
                            className="inline-flex flex-col items-center gap-0.5"
                            title={cvdFlagHint(flag, cvdReason, row)}
                          >
                            <span
                              className={cn(
                                "text-sm font-bold leading-none tabular-nums",
                                flag === "red"
                                  ? "text-red-600 dark:text-red-400"
                                  : flag === "yellow"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                              )}
                            >
                              {formatDays(cvdEst)}
                            </span>
                            {cvdReason === "minPack" ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-px vmi-t-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                ขั้นต่ำ 1 หีบ
                              </span>
                            ) : (
                              <FlagBadge flag={flag} compact />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {showFreeGoodRow && row.freeGood && (
                      <FreeGoodStockTableRow freeGood={row.freeGood} />
                    )}
                    {isExpanded && (
                      <tr className="bg-slate-50/40 dark:bg-slate-900/30">
                        <td />
                        <td colSpan={12} className="px-2 pb-3 pt-0">
                          <ExpandedMeasure
                            skuId={row.skuId}
                            onMeasure={measureExpanded}
                          >
                            <ProductSalesPanel
                              skuCode={row.skuCode}
                              fromDb={row.fromDb ?? activeVda}
                              packSize={row.packSize}
                            />
                          </ExpandedMeasure>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
                  {virtualItems &&
                    (() => {
                      const last = virtualItems[virtualItems.length - 1];
                      if (!last) return null;
                      const bottom = rowVirtualizer.getTotalSize() - last.end;
                      if (bottom <= 0) return null;
                      return (
                        <tr aria-hidden>
                          <td
                            colSpan={13}
                            style={{
                              height: bottom,
                              padding: 0,
                              border: "none",
                            }}
                          />
                        </tr>
                      );
                    })()}
                </>
              )}
            </tbody>
          </table>
            )}
          </div>
        </div>
      </main>

      <div className="vmi-action-bar">
        <div className="mx-auto flex w-full max-w-none flex-col gap-1 px-0 sm:flex-row sm:items-center sm:gap-3">
          <p className="min-w-0 flex-1 truncate text-center text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            {selected.size > 0 ? (
              selectedRedCount > 0 ? (
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  มี {selectedRedCount} รายการจำนวนไม่เหมาะสม — ปรับได้ หรือกดตรวจสอบเพื่อยืนยัน
                </span>
              ) : selectedZeroQtyCount > 0 ? (
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  มี {selectedZeroQtyCount} รายการจำนวน 0 — ปรับก่อนตรวจสอบ
                </span>
              ) : (
                <>
                  <span className="font-semibold text-teal-700 dark:text-teal-400">
                    {selected.size}
                  </span>{" "}
                  รายการพร้อมสั่ง
                </>
              )
            ) : (
              <>เลือกสินค้า ปรับจำนวน ตรวจโปร แล้วกดตรวจสอบคำสั่ง</>
            )}
          </p>
          {/* ปุ่มจัดการการเลือก — ย้ายมาไว้ที่แถบล่างให้ทูลบาร์บนโล่ง */}
          {selected.size === 0 &&
            filters.view === "noSales" &&
            displayRows.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mx-auto shrink-0 border-red-200 text-red-600 hover:bg-red-50 sm:mx-0 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={selectAllDisplayed}
                title="เลือกสินค้าที่ไม่ขายทั้งหมดในตาราง เพื่อกดหยุดสั่งรวดเดียว"
              >
                <Ban className="h-4 w-4" />
                เลือกทั้งหมด ({displayRows.length})
              </Button>
            )}
          {selected.size === 0 &&
            filters.view !== "noSales" &&
            filteredNeedsOrder.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              className="mx-auto shrink-0 sm:mx-0"
              onClick={() => selectByFilter()}
              title="ติ๊กเลือกทุกรายการที่ควรสั่งตามตัวกรองปัจจุบัน"
            >
              <Check className="h-4 w-4" />
              เลือกที่ควรสั่ง ({filteredNeedsOrder.length})
            </Button>
          )}
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="mx-auto shrink-0 sm:mx-0"
              onClick={clearSelection}
              title="ยกเลิกการเลือกทั้งหมด"
            >
              ล้างการเลือก
            </Button>
          )}
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="mx-auto shrink-0 border-red-200 text-red-600 hover:bg-red-50 sm:mx-0 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              onClick={() => setStopOpen(true)}
              title="หยุดสั่ง / เอาออกจากคลัง สำหรับรายการที่เลือก"
            >
              <Ban className="h-4 w-4" />
              <span className="hidden sm:inline">หยุดสั่ง</span>
              {` (${selected.size})`}
            </Button>
          )}
          <Button
            size="sm"
            className="mx-auto shrink-0 sm:mx-0 sm:px-5"
            // จำนวน 0 กั้นได้ (ส่งไปก็ไม่มีความหมาย) แต่ "จำนวนไม่เหมาะสม" เป็นคำแนะนำ
            // ห้ามกั้นจนส่งไม่ได้ — ขอให้ยืนยันครั้งเดียวแทน
            disabled={selected.size === 0 || selectedZeroQtyCount > 0}
            onClick={() => {
              if (selectedRedCount > 0) {
                setConfirmRiskyOpen(true);
                return;
              }
              goToOrder();
            }}
            title={
              selectedZeroQtyCount > 0
                ? "มีรายการจำนวน 0 ปรับก่อนตรวจสอบ"
                : selectedRedCount > 0
                  ? "มีรายการจำนวนไม่เหมาะสม — กดแล้วจะให้ยืนยันก่อนส่ง"
                  : undefined
            }
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">ตรวจสอบคำสั่ง</span>
            <span className="sm:hidden">ตรวจสอบ</span>
            {selected.size > 0 && ` (${selected.size})`}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRiskyOpen}
        tone="default"
        title="ยืนยันจำนวนที่สั่ง"
        body={
          <>
            มี {selectedRedCount} รายการที่จำนวนยังไม่เข้าเป้าหมาย MIN/MAX
            <br />
            ส่งต่อไปให้พนักงานตรวจได้ — พนักงานจะเห็นธงเตือนนี้ด้วย
          </>
        }
        confirmLabel="ตรวจสอบคำสั่ง"
        onConfirm={() => goToOrder()}
        onClose={() => setConfirmRiskyOpen(false)}
      />

      <StopOrderModal
        open={stopOpen}
        selectedCount={selected.size}
        skuIds={[...selected]}
        onClose={() => setStopOpen(false)}
        onSuccess={async () => {
          clearSelection();
          await queryClient.invalidateQueries({ queryKey: ["stock"] });
        }}
      />
    </PageShell>
  );
}

/** วัดความสูงจริงของแผงที่กางออก แล้วแจ้ง parent (ให้ virtualizer ปรับ spacer ให้ตรง)
 *  ยิงตอน mount และทุกครั้งที่ความสูงเปลี่ยน (เช่น toggle 7↔30 ในแผง) ผ่าน ResizeObserver */
function ExpandedMeasure({
  skuId,
  onMeasure,
  children,
}: {
  skuId: string;
  onMeasure: (skuId: string, height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      onMeasure(skuId, el.getBoundingClientRect().height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [skuId, onMeasure]);
  return <div ref={ref}>{children}</div>;
}

const StockMobileRow = memo(function StockMobileRow({
  row,
  storeCode,
  qty,
  selected,
  orderCvd,
  orderFlag,
  orderCvdReason,
  stagedQty,
  suggestByProduct,
  onConfirmStaged,
  promoApplyVersion,
  groupMemberSkus,
  groupHasBenefit = false,
  afterPromoGroup = false,
  onAdjustQty,
  onSetQty,
  onApplySuggest,
  onToggle,
  expanded,
  onToggleExpand,
  showFreeGoodRow,
  recentOrder,
}: {
  row: DisplayRow;
  storeCode: string;
  qty: number;
  recentOrder?: RecentOrderSummary;
  selected: boolean;
  orderCvd: number | null;
  orderFlag: CvdFlag | null;
  orderCvdReason: CvdFlagReason;
  stagedQty: Record<string, number>;
  suggestByProduct: Record<string, number>;
  onConfirmStaged: (
    staged: Record<string, number>,
    memberSkus?: string[]
  ) => void;
  promoApplyVersion: number;
  groupMemberSkus: string[];
  /** กลุ่มโปรนี้ให้ส่วนลด/ของแถมจริงหรือไม่ — false = ไม่ต้องมีปุ่มดูโปรบนหัวกลุ่ม */
  groupHasBenefit?: boolean;
  afterPromoGroup?: boolean;
  onAdjustQty: (delta: number) => void;
  onSetQty: (qty: number) => void;
  onApplySuggest: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  showFreeGoodRow?: boolean;
}) {
  const lowStock =
    row.needsOrder || (row.stockCvd !== null && row.stockCvd < row.minDays);
  const hasPromo = Boolean(
    row.currentPromo ||
      row.nextPromo ||
      row.hasPromoLadder ||
      (row.freeGood && row.freeGood.qty > 0) ||
      // มีส่วนลด/ของแถมจริงในบันได — ต้องขึ้นป้ายกลุ่ม + เงื่อนไขขั้นแรก แม้ยังไม่ได้สั่ง
      (row.promoTiers ?? []).some(isBenefitTier)
  );

  return (
    <>
    <MobileRow
      data-sku-code={row.skuCode}
      selected={selected}
      // MobileRow จัดการพื้นหลังตอน selected ให้แล้ว (selected ชนะ warn)
      warn={orderFlag === "red" || lowStock}
      className={cn(
        "vmi-cv-auto",
        afterPromoGroup && "border-t-2 border-t-slate-300 dark:border-t-slate-600",
        // กลุ่มโปร = แถบตั้งซ้าย เหมือนฝั่งเดสก์ท็อป
        promoGroupBorderClass(row.promoGroupStripe ?? null),
        // สีแดงเฉพาะตอนยังไม่ถูกเลือก — ถูกเลือกแล้วต้องเป็นเขียวจาก MobileRow
        !selected && orderFlag === "red" && "bg-red-50/70 dark:bg-red-950/25"
      )}
    >
      {row.promoGroupIsFirst && row.promoGroupStripe != null && row.promoGroup && (
        <div className="px-3 pb-1.5 pt-2.5">
          <PromoGroupHeader
            promoGroup={row.promoGroup}
            stripe={row.promoGroupStripe}
            storeCode={storeCode}
            hostSkuCode={row.skuCode}
            memberSkus={groupMemberSkus}
            stagedQty={stagedQty}
            suggestByProduct={suggestByProduct}
            onConfirmStaged={onConfirmStaged}
            applyVersion={promoApplyVersion}
            showPromoButton={groupHasBenefit}
            tiers={row.promoTiers}
            endsInDays={row.currentPromoEndsInDays}
          />
        </div>
      )}
      <MobileRowTop>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 text-left"
          title="ดู/ซ่อนยอดขายรายวัน"
        >
          <p className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">
            <span className="text-teal-700 dark:text-teal-400">{row.skuCode}</span>
            <span className="mx-1.5 font-normal text-slate-300 dark:text-slate-600">
              ·
            </span>
            <span
              className={cn(
                "font-medium text-slate-800 dark:text-slate-200",
                expanded && "text-teal-700 dark:text-teal-400"
              )}
            >
              {row.skuName}
            </span>
            <BarChart3
              className={cn(
                "ml-1.5 inline h-3.5 w-3.5 shrink-0 align-text-bottom text-slate-300",
                expanded
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-slate-300 dark:text-slate-600"
              )}
            />
          </p>
          {row.barcode && (
            <p className="mt-0.5 font-mono vmi-t-xs text-slate-400 dark:text-slate-500">
              {row.barcode}
            </p>
          )}
          {recentOrder && (
            <span className="mt-1 inline-flex">
              <OrderedBadge info={recentOrder} />
            </span>
          )}
        </button>
        <StockQtyStepper
          qty={qty}
          suggestOrder={row.suggestOrder}
          onMinus={() => onAdjustQty(-1)}
          onPlus={() => onAdjustQty(1)}
          onSetQty={onSetQty}
          onApplySuggest={onApplySuggest}
          compact
        />
      </MobileRowTop>
      <MobileRowStats className="pl-7">
        <MobileStat label="สต็อก · หีบ/เศษ">
          <StockCaseCell
            cases={row.stockCases}
            remainder={row.stockRemainder}
            pieces={row.stockPieces}
            packSize={row.packSize}
          />
        </MobileStat>
        <MobileStat
          label="ขายเฉลี่ย · หีบ (ชิ้น)"
          title="จาก stock_cover (avg_qty_out_L7) — ไม่ใช่ยอดบิล"
        >
          <StockAvgSalesCell
            avgCases={row.avgQtyOutL7 ?? row.avgSales}
            packSize={row.packSize}
            inline
          />
        </MobileStat>
        <MobileStat label="CVD" value={formatDays(row.stockCvd)} />
        {orderFlag && (
          <MobileStat label="CVD หลังสั่ง">
            <div
              className="flex flex-col items-start gap-0.5"
              title={cvdFlagHint(orderFlag, orderCvdReason, row)}
            >
              {orderCvdReason === "minPack" ? (
                <span className="inline-flex items-center rounded bg-slate-100 px-1 py-px vmi-t-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  ขั้นต่ำ 1 หีบ
                </span>
              ) : (
                <FlagBadge flag={orderFlag} compact />
              )}
              <span
                className={cn(
                  "vmi-t-xs tabular-nums",
                  orderFlag === "red"
                    ? "font-semibold text-red-600 dark:text-red-400"
                    : "text-slate-500"
                )}
              >
                {formatDays(orderCvd)}
              </span>
            </div>
          </MobileStat>
        )}
        <MobileStat label="ราคา">
          <StockListPriceCell
            unitPrice={row.unitPrice}
            expired={row.priceExpired}
            compact
          />
        </MobileStat>
        {(row.discountBahtPerCase != null && row.discountBahtPerCase > 0) ||
        (row.discountPctPerCase != null && row.discountPctPerCase > 0) ? (
          <MobileStat label="ลด">
            <StockDiscountPerCaseCell
              discountBaht={row.discountBahtPerCase}
              discountPct={row.discountPctPerCase}
              compact
            />
          </MobileStat>
        ) : null}
        <MobileStat label="ราคาสุทธิ/หีบ">
          <StockNetPriceCell
            unitPrice={row.unitPrice}
            netUnitPrice={row.netUnitPrice}
            expired={row.priceExpired}
            compact
          />
        </MobileStat>
      </MobileRowStats>
      {hasPromo && (
        <MobileRowExtra className="pl-7">
          <PromoDetailCell
            variant="embedded"
            currentPromo={row.currentPromo}
            currentKind={row.currentPromoKind}
            nextPromo={row.nextPromo}
            qtyToNext={row.qtyToNext}
            nextPromoQty={row.nextPromoQty}
            nextKind={row.nextPromoKind}
            freeGood={row.freeGood}
            showFreeGoodChip={false}
            hasPromoLadder={row.hasPromoLadder}
            tiers={row.promoTiers}
            endsInDays={row.currentPromoEndsInDays}
            onApplyNext={onSetQty}
            muted={row.suggestOrder <= 0}
            showGroupChip={row.promoGroupStripe == null}
            inspector={buildPromoInspectorProps(row, {
              storeCode,
              stagedQty,
              memberSkus: groupMemberSkus,
              onConfirmStaged,
              suggestByProduct,
            })}
          />
        </MobileRowExtra>
      )}
      {expanded && (
        <MobileRowExtra className="pl-7">
          <ProductSalesPanel
            skuCode={row.skuCode}
            fromDb={row.fromDb ?? storeCode}
            packSize={row.packSize}
          />
        </MobileRowExtra>
      )}
    </MobileRow>
    {showFreeGoodRow && row.freeGood && (
      <FreeGoodMobileCard freeGood={row.freeGood} />
    )}
    </>
  );
});

/** props ของตัวเปิดดูขั้นบันไดโปร — เปิดให้ทุกแถวที่มีโปร ไม่ว่าจะเรียงแบบไหน
 *  แถวในกลุ่มโปร (pooled) จะเปิด modal แบบกลุ่มพร้อมรายชื่อ SKU ที่ร้านนี้มีของ */
/** หัวคอลัมน์ที่กดเรียงได้ — ลูกศรโผล่เมื่อ active, จาง ๆ ตอน hover เพื่อบอกว่ากดได้ */
function SortableTh({
  label,
  sub,
  sortKey,
  sort,
  onSort,
  align = "left",
  firstDir = "asc",
  title,
}: {
  label: string;
  sub?: string;
  sortKey: StockSortKey;
  sort: StockSortState;
  onSort: (key: StockSortKey, firstDir?: "asc" | "desc") => void;
  align?: "left" | "right" | "center";
  firstDir?: "asc" | "desc";
  title?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn(
        "px-1 py-2 leading-tight",
        align === "right" && "text-right",
        align === "center" && "text-center"
      )}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey, firstDir)}
        title={title}
        className={cn(
          "group inline-flex max-w-full items-center gap-0.5 rounded transition-colors hover:text-teal-700 dark:hover:text-teal-400",
          active && "font-semibold text-teal-700 dark:text-teal-400"
        )}
      >
        <span className="min-w-0">
          {label}
          {sub && (
            <>
              <br />
              <span
                className={cn(
                  "vmi-t-xs font-normal",
                  active ? "text-teal-600/70 dark:text-teal-400/70" : "text-slate-400"
                )}
              >
                {sub}
              </span>
            </>
          )}
        </span>
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
        )}
      </button>
    </th>
  );
}

function formatDataDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** สรุปการสั่งล่าสุดต่อ SKU จาก /api/store/order-history?summary=1 */
type RecentOrderSummary = {
  totalQty: number;
  lastQty: number;
  orderedAt: string;
  status: string;
  daysAgo: number;
  orderCount: number;
};

const EMPTY_RECENT: Record<string, RecentOrderSummary> = {};

/** ป้ายเตือน "สั่งไปแล้ว" — กันร้านสั่งซ้ำโดยไม่รู้ตัว */
function OrderedBadge({ info }: { info: RecentOrderSummary }) {
  const pending = info.status === "pending_approval";
  const when =
    info.daysAgo === 0 ? "วันนี้" : `${formatNumber(info.daysAgo, 0)} วันก่อน`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 vmi-t-xs font-bold",
        pending
          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
          : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
      )}
      title={`สั่งไปแล้ว ${formatNumber(info.totalQty, 0)} หีบ จาก ${formatNumber(info.orderCount, 0)} ออเดอร์ใน 14 วัน · ล่าสุด ${when}${pending ? " (ยังรออนุมัติ)" : ""}`}
    >
      <History className="h-2.5 w-2.5" />
      สั่งแล้ว {formatNumber(info.totalQty, 0)} · {when}
    </span>
  );
}

/** tooltip badge หยุดสั่ง — เหตุผล + ช่วงวันที่ (ไม่มีวันสิ้นสุด = ถาวร) */
function formatBlockTitle(row: {
  blockReason?: string | null;
  blockEffectiveFrom?: string | null;
  blockEffectiveTo?: string | null;
}): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  const parts = [`หยุดสั่ง: ${row.blockReason ?? ""}`];
  if (row.blockEffectiveFrom) {
    parts.push(
      row.blockEffectiveTo
        ? `${fmt(row.blockEffectiveFrom)} – ${fmt(row.blockEffectiveTo)}`
        : `ตั้งแต่ ${fmt(row.blockEffectiveFrom)} · ถาวร`
    );
  }
  return parts.join(" · ");
}
