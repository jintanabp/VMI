"use client";

import { appPath } from "@/lib/paths";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useSalesSession } from "@/hooks/use-sales-session";
import { useSalesPreview } from "@/hooks/use-sales-preview";
import { useVdaOptions } from "@/hooks/use-vda-options";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { SalesNav } from "./sales-nav";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SalesRepFilter } from "@/components/sales/sales-rep-filter";
import {
  PoSplitPanel,
  poSplitCount,
  poSplitIssues,
  toSplittable,
  assignmentsFor,
} from "@/components/sales/po-split-panel";
import { RejectOrderModal } from "@/components/sales/reject-order-modal";
import { NotifyStoreCheckbox } from "@/components/sales/notify-store-checkbox";
import { MonthEndClearModal } from "@/components/sales/month-end-clear-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  OrderReviewTable,
  type ReviewOrderItem,
} from "@/components/sales/order-review-table";
import { formatStoreLabel } from "@/lib/format-store-label";
import { getCvdFlag } from "@/lib/calculations";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/error-message";

// ใช้ type เดียวกับตารางรีวิว เพื่อไม่ให้ฟิลด์สองที่หลุดกัน
type OrderItem = ReviewOrderItem;

interface SalesRep {
  id: string;
  name: string;
  email: string;
  code: string;
}

interface Order {
  id: string;
  status: string;
  createdAt: string;
  rejectReason?: string | null;
  store: {
    code: string;
    name: string;
    salesRep?: { id: string; name: string; email: string } | null;
  };
  items: OrderItem[];
}

/** รายการที่รอร้านยืนยัน (พนักงานเพิ่มจำนวน/เพิ่มสินค้าใหม่) — มีเมื่อไหร่อนุมัติทั้งใบไม่ได้
 *  (เซิร์ฟเวอร์กันด้วย 422 อยู่แล้ว ฝั่งนี้กันไว้ให้รู้ก่อนกด) */
function pendingConfirmCount(items: OrderItem[]): number {
  return items.filter((i) => i.qtyIncreasePendingConfirm).length;
}

/** จำนวนรายการธงแดงในออเดอร์ — ใช้ทั้งตอนเลือก bulk และในกล่องปฏิเสธ */
function orderRedFlagCount(order: Order): number {
  return order.items.filter(
    (i) =>
      getCvdFlag(i.cvdEstimate, i.minDays ?? undefined, i.maxDays ?? undefined) ===
      "red"
  ).length;
}

export function SalesOrdersClient() {
  const { session } = useSalesSession();
  const salesPreview = useSalesPreview();
  const queryClient = useQueryClient();
  const isAdmin = session?.role === "admin";
  const [statusFilter, setStatusFilter] = useState("pending_approval");
  const [salesRepFilter, setSalesRepFilter] = useState("");
  const [vdaFilter, setVdaFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "store">("date");
  const [switchingCode, setSwitchingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [allPersonVdas, setAllPersonVdas] = useState(false);
  /** รายการที่ติ๊กไว้เพื่อย้ายกลุ่ม PO (ล้างเมื่อเปลี่ยนออเดอร์) */
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [monthEndClearOpen, setMonthEndClearOpen] = useState(false);
  /** แจ้งร้านว่าถูกลบหรือไม่ — ลบทีละใบระหว่างทำงานปกติควรแจ้ง จึงตั้งต้นเป็น true */
  const [notifyStores, setNotifyStores] = useState(true);
  /** ออเดอร์ที่ติ๊กไว้เพื่ออนุมัติ/ลบรวดเดียว (คนละชุดกับ selectedItemIds ที่ใช้ย้ายกลุ่ม PO) */
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [bulkResult, setBulkResult] = useState<{
    ok: string[];
    failed: { label: string; error: string }[];
  } | null>(null);
  /** เลข PO ที่ออกหลังอนุมัติ — เดิม route คืน poExportPath มาแล้วถูกทิ้ง */
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  /** มาจากกดแจ้งเตือน — ?order=<id>&status=<สถานะตอนนี้> เปิดใบนั้นให้เลย */
  const focusOrderId = searchParams.get("order");
  const focusStatus = searchParams.get("status");
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  /** ขยายตารางสินค้าเต็มจอ (ซ่อนรายการออเดอร์ซ้าย) — จำไว้ในเครื่อง ความชอบของแต่ละคน */
  const [tableExpanded, setTableExpanded] = useState(false);
  useEffect(() => {
    try {
      setTableExpanded(window.localStorage.getItem("vmi-sales-table-expanded") === "1");
    } catch {
      // storage ถูกบล็อก — ใช้ค่าเริ่มต้น
    }
  }, []);
  function toggleTableExpanded() {
    setTableExpanded((v) => {
      try {
        window.localStorage.setItem("vmi-sales-table-expanded", v ? "0" : "1");
      } catch {
        // ไม่จำก็ได้
      }
      return !v;
    });
  }
  const [approveOpen, setApproveOpen] = useState(false);
  const [issuedPos, setIssuedPos] = useState<
    { poNumber: string; label: string; itemCount: number; totalQty: number }[]
  >([]);

  // รายชื่อ VDA + สถานะพร้อมใช้ ใช้ร่วมกับหน้า PO ผ่าน hook เดียวกัน (แชร์ react-query cache)
  const { availableVdas, vdaAccess, ready: ordersReady } = useVdaOptions();

  const noVdaAccess =
    !isAdmin &&
    vdaAccess &&
    !vdaAccess.isAdmin &&
    vdaAccess.vdaRegistryLoaded &&
    !vdaAccess.hasVdaAccess &&
    !allPersonVdas;

  const personAllVdas = vdaAccess?.allPersonVdas ?? [];
  const canViewAllPersonVdas =
    !isAdmin &&
    personAllVdas.length > 0 &&
    Boolean(vdaAccess?.multipleCodes);

  const { data: salesReps = [] } = useQuery<SalesRep[]>({
    queryKey: ["admin-salesmen"],
    queryFn: () => apiFetch(appPath("/api/admin/salesmen")).then((r) => r.json()),
    enabled: isAdmin,
  });


  useEffect(() => {
    if (isAdmin || availableVdas.length === 0 || vdaFilter) return;
    setVdaFilter(availableVdas[0]);
  }, [availableVdas, vdaFilter, isAdmin]);

  async function handleSalesCodeChange(code: string) {
    if (!code || code === vdaAccess?.salesmanCode || switchingCode) return;
    setSwitchingCode(true);
    setCodeError(null);
    try {
      const res = await apiFetch(appPath("/api/sales/active-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(friendlyError(data.error, "เปลี่ยนรหัสไม่สำเร็จ"));
      }
      setVdaFilter("");
      setAllPersonVdas(false);
      queryClient.invalidateQueries({ queryKey: ["sales-vda-access"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      window.location.reload();
    } catch (err) {
      setCodeError(
        err instanceof Error ? err.message : "เปลี่ยนรหัสไม่สำเร็จ"
      );
    } finally {
      // ต้องอยู่ใน finally — ถ้า reload ถูกบล็อก/ช้า select จะ disabled ค้างถาวร
      setSwitchingCode(false);
    }
  }

  const ordersUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (isAdmin && salesRepFilter) params.set("salesRepId", salesRepFilter);
    if (allPersonVdas) params.set("allPersonVdas", "true");
    else if (vdaFilter) params.set("vdaCode", vdaFilter);
    const qs = params.toString();
    // ต้องผ่าน appPath() เพราะแอปเสิร์ฟใต้ basePath /vmi — ยิงตรงจะได้ 404
    return `${appPath("/api/orders")}${qs ? `?${qs}` : ""}`;
  }, [statusFilter, salesRepFilter, vdaFilter, allPersonVdas, isAdmin]);

  // ordersReady มาจาก useVdaOptions — isAdmin อยู่ใน queryKey และมาจาก session แบบ async
  // ถ้าไม่รอ session จะยิงสองครั้งทุกครั้งที่ mount
  const {
    data: orders = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery<Order[]>({
    queryKey: ["orders", statusFilter, salesRepFilter, vdaFilter, allPersonVdas, isAdmin],
    enabled: ordersReady,
    queryFn: async () => {
      const res = await apiFetch(ordersUrl);
      if (!res.ok) throw new Error(`โหลดออเดอร์ไม่สำเร็จ (${res.status})`);
      // เส้น 401 คืน { error } ซึ่งเป็น object — ถ้าหลุดมาโดย res.ok
      // จะระเบิดที่ sorted.map ทีหลัง กันไว้แบบเดียวกับ sales-nav.tsx
      const raw: unknown = await res.json();
      return Array.isArray(raw) ? (raw as Order[]) : [];
    },
  });

  // query ที่ disabled จะรายงาน isLoading = false — ถ้าใช้ค่านั้นตรง ๆ
  // จะโชว์ "ไม่มีออเดอร์" แวบหนึ่งก่อน session มาถึง
  const showLoading = !ordersReady || isLoading;

  /**
   * ร้านส่งออเดอร์ใหม่เข้ามาระหว่างที่เซลล์เปิดหน้านี้ค้างไว้ — เดิมลิสต์ไม่รีเฟรชเลย
   * (ไม่มี poll และ refetchOnWindowFocus ปิดอยู่ทั้งระบบ) badge บนแท็บขึ้นเลขใหม่
   * แต่ลิสต์ข้างล่างยังเป็นชุดเดิม เซลล์เห็นตัวเลขไม่ตรงกับของที่เห็นจริง
   *
   * ไม่ poll /api/orders ตรง ๆ เพราะ route นั้นคืนออเดอร์ทั้งหมดพร้อม items และ Sku
   * แบบไม่แบ่งหน้า (เป็นเหตุผลที่ต้องแยก /api/sales/pending-count ออกมาตั้งแต่แรก)
   * — ใช้วิธี poll ตัวนับที่เบา แล้วค่อยดึงลิสต์ใหม่เมื่อ "จำนวนเปลี่ยนจริง" เท่านั้น
   */
  const { data: pendingCount } = useQuery<{ pending: number }>({
    queryKey: ["sales-pending-count"],
    queryFn: async () => {
      const r = await apiFetch(appPath("/api/sales/pending-count"));
      if (!r.ok) return { pending: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: ordersReady,
  });

  const lastPending = useRef<number | null>(null);
  useEffect(() => {
    const n = pendingCount?.pending;
    if (n == null) return;
    if (lastPending.current !== null && lastPending.current !== n) {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
    lastPending.current = n;
  }, [pendingCount?.pending, queryClient]);

  /**
   * ออเดอร์ที่ติ๊กเพื่ออนุมัติรวดได้ — ต้องยังรออนุมัติ และแบ่ง PO ผ่าน
   * (ปุ่มอนุมัติเดี่ยวก็กั้นด้วย poSplitIssues เหมือนกัน ถ้าไม่กรองตรงนี้
   *  bulk จะพังกลางคันโดยผู้ใช้ไม่รู้ว่าทำไม)
   */
  const bulkEligible = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === "pending_approval" &&
          poSplitIssues(o.items).length === 0 &&
          pendingConfirmCount(o.items) === 0
      ),
    [orders]
  );

  const bulkSelectedOrders = useMemo(
    () => bulkEligible.filter((o) => bulkIds.has(o.id)),
    [bulkEligible, bulkIds]
  );

  /** ทุกใบที่ติ๊กไว้ในรายการที่เห็นอยู่ — ลบได้ทุกสถานะ ไม่เหมือนอนุมัติ
   *  (นับจากรายการจริง ไม่ใช่ bulkIds.size — id ที่ตกค้างจากตัวกรองก่อนหน้าจะไม่ถูกนับ) */
  const deleteSelectedOrders = useMemo(
    () => orders.filter((o) => bulkIds.has(o.id)),
    [orders, bulkIds]
  );

  /** จำนวน PO ที่จะหายไปพร้อมกับออเดอร์ที่เลือก — ใช้เตือนในกล่องยืนยัน */
  const deleteSelectedApproved = useMemo(
    () => deleteSelectedOrders.filter((o) => o.status === "approved").length,
    [deleteSelectedOrders]
  );

  function toggleBulk(orderId: string) {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  /**
   * ติ๊กทั้งรายการ — ตอนดูใบที่รออนุมัติจะเลือกเฉพาะใบที่ไม่มีธงแดง (ตั้งใจให้กดอนุมัติต่อได้เลย)
   * ส่วนสถานะอื่นไม่มีอะไรให้อนุมัติ จึงติ๊กทุกใบเพื่อใช้ลบล้างประวัติ
   */
  function selectAllOnList() {
    setBulkIds(
      new Set(
        bulkEligible.length > 0
          ? bulkEligible
              .filter((o) => orderRedFlagCount(o) === 0)
              .map((o) => o.id)
          : orders.map((o) => o.id)
      )
    );
  }

  /**
   * อนุมัติทีละใบตามลำดับ — ห้ามยิงพร้อมกัน
   * ทุกใบ mint เลข PO จาก PoSequence ตัวเดียวกัน ยิงขนานกันเสี่ยงได้เลขชนกัน
   * และไม่หยุดที่ error แรก เพราะใบที่เหลือยังอนุมัติได้ — เก็บผลไปสรุปตอนจบ
   */
  async function runBulkApprove() {
    const targets = bulkSelectedOrders;
    if (targets.length === 0) return;
    setBulkResult(null);
    setActionError(null);
    setBulkProgress({ done: 0, total: targets.length });

    const ok: string[] = [];
    const failed: { label: string; error: string }[] = [];

    for (const [i, order] of targets.entries()) {
      const label = formatStoreLabel(order.store.code, order.store.name);
      try {
        const res = await apiFetch(appPath("/api/orders"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, action: "approve" }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: unknown;
            issues?: unknown;
          } | null;
          const issues = Array.isArray(data?.issues)
            ? ` — ${data.issues.join(" · ")}`
            : "";
          throw new Error(
            (typeof data?.error === "string"
              ? data.error
              : `ไม่สำเร็จ (${res.status})`) + issues
          );
        }
        const body = (await res.json()) as {
          purchaseOrders?: { poNumber: string }[];
        };
        const pos = (body.purchaseOrders ?? []).map((p) => p.poNumber);
        ok.push(pos.length > 0 ? `${label} → ${pos.join(", ")}` : label);
      } catch (err) {
        failed.push({
          label,
          error: err instanceof Error ? err.message : "ไม่สำเร็จ",
        });
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }

    setBulkProgress(null);
    setBulkResult({ ok, failed });
    setBulkIds(new Set());
    // invalidate ครั้งเดียวตอนจบ ไม่ใช่ทุกใบ
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
      queryClient.invalidateQueries({ queryKey: ["sales-pending-count"] }),
    ]);
  }

  const sorted = useMemo(() => {
    const copy = [...orders];
    if (sortBy === "date") {
      copy.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else {
      copy.sort((a, b) => a.store.code.localeCompare(b.store.code));
    }
    return copy;
  }, [orders, sortBy]);

  const selected = sorted.find((o) => o.id === selectedId) ?? sorted[0];

  // กดแจ้งเตือนมา: สลับตัวกรองให้ใบนั้นอยู่ในลิสต์ (สถานะตามจริง ทุก VDA) แล้วรอลิสต์โหลดเสร็จค่อยเลือก
  // ลบ ?order= ทิ้งทันที ไม่งั้นกดแจ้งเตือนเดิมซ้ำแล้วไม่มีอะไรเกิดขึ้น
  useEffect(() => {
    if (!focusOrderId) return;
    setStatusFilter(focusStatus ?? "");
    setVdaFilter("");
    setSalesRepFilter("");
    setPendingFocus(focusOrderId);
    router.replace("/sales/orders", { scroll: false });
  }, [focusOrderId, focusStatus, router]);

  useEffect(() => {
    if (!pendingFocus || showLoading) return;
    if (orders.some((o) => o.id === pendingFocus)) {
      setSelectedId(pendingFocus);
      requestAnimationFrame(() =>
        document
          .getElementById(`sales-order-${pendingFocus}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      );
    } else if (!isFetching) {
      toast({ title: "ไม่พบออเดอร์นี้แล้ว — อาจถูกลบหรือเคลียร์ไปแล้ว", tone: "warn" });
    } else {
      return; // ลิสต์ของตัวกรองใหม่ยังโหลดไม่เสร็จ รอรอบหน้า
    }
    setPendingFocus(null);
  }, [pendingFocus, showLoading, isFetching, orders, toast]);

  // สลับออเดอร์แล้วต้องล้างการติ๊ก ไม่งั้น id ของใบเก่าจะค้างไปย้ายกลุ่มในใบใหม่
  useEffect(() => {
    setSelectedItemIds(new Set());
    setIssuedPos([]);
  }, [selected?.id]);

  /** จำนวนบรรทัดที่ราคาต่างจากระบบ — ร้านตั้งมาเอง หรือเซลล์แก้ในหน้านี้ก็นับ */
  const selectedPriceFlagged =
    selected?.items?.filter((i) => i.priceFlagged).length ?? 0;
  const approveNeedsConfirm = selectedPriceFlagged > 0;

  /**
   * ติ๊กบางรายการ = อนุมัติเฉพาะที่ติ๊ก ที่เหลือแยกเป็นออเดอร์ใหม่รออนุมัติ (ติ๊กครบ/ไม่ติ๊ก = ทั้งใบ)
   * การติ๊กชุดเดียวกันนี้ยังใช้ "ย้ายมา PO-X" ในแผงแบ่ง PO ได้เหมือนเดิม
   */
  const partialItems =
    selected &&
    selectedItemIds.size > 0 &&
    selectedItemIds.size < selected.items.length
      ? selected.items.filter((i) => selectedItemIds.has(i.id))
      : null;
  const approveItems = partialItems ?? selected?.items ?? [];

  /** ยอดที่กำลังจะออก PO — คิดแบบเดียวกับแผงแบ่ง PO (ราคาที่มีผล + ส่วนลด C4 ที่แช่ไว้) */
  // คำนวณสดทุก render (เบา — ไม่กี่สิบบรรทัด) ไม่ต้อง memo
  const approveLines = toSplittable(approveItems);
  const approveTotals = {
    count: approveLines.length,
    qty: approveLines.reduce((s, l) => s + l.finalQty, 0),
    amount: approveLines.reduce((s, l) => s + (l.effectiveUnitPrice ?? 0) * l.finalQty, 0),
  };

  /** สมาชิกกลุ่มโปรที่รวมยอดกันต้องอยู่ด้วยกันเสมอ — ติ๊ก/เอาออกตัวเดียวก็ทั้งกลุ่ม */
  function promoSiblings(itemId: string): string[] {
    const item = selected?.items.find((i) => i.id === itemId);
    const g = item?.c4PromoGroup?.trim();
    if (!item || !g || (item.c4PromoGroupMembers ?? 0) <= 1) return [itemId];
    return selected!.items
      .filter((i) => i.c4PromoGroup?.trim() === g)
      .map((i) => i.id);
  }

  function toggleItemSelect(itemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      const ids = promoSiblings(itemId);
      if (next.has(itemId)) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  /** เลือกหลายแถวพร้อมกันจากตัวกรอง (เช่น "เลือกทั้งหมดที่กรองอยู่" ใน OrderReviewTable) */
  function selectManyItems(itemIds: string[]) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      for (const id of itemIds) promoSiblings(id).forEach((x) => next.add(x));
      return next;
    });
  }

  /**
   * ลบออเดอร์ — ใบเดียวหรือหลายใบก็เส้นเดียวกัน
   *
   * ส่ง withPo=1 เสมอ เพราะกล่องยืนยันบอกไปแล้วว่า PO ที่ออกไปจะถูกลบด้วย
   * (ค่าเริ่มต้นฝั่ง API ยังกันไว้ ไม่ได้เปิดให้ทุก caller ลบใบที่ออก PO แล้ว)
   */
  const deleteMutation = useMutation({
    mutationFn: async (vars: {
      orderIds: string[];
      notify: boolean;
      /** false = ข้ามใบที่ออก PO แล้วโดยอัตโนมัติ (ไม่ลบ) — ใช้กับ "เคลียร์ออเดอร์สิ้นเดือน" */
      allowIssuedPo: boolean;
    }) => {
      const params = new URLSearchParams({
        orderIds: vars.orderIds.join(","),
      });
      if (vars.allowIssuedPo) params.set("withPo", "1");
      if (!vars.notify) params.set("notify", "0");
      const res = await apiFetch(
        `${appPath("/api/orders")}?${params.toString()}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `ลบออเดอร์ไม่สำเร็จ (${res.status})`
        );
      }
      return res.json() as Promise<{
        deletedIds: string[];
        deletedPoNumbers: string[];
        skipped: { orderId: string; reason: string }[];
      }>;
    },
    onSuccess: (data) => {
      // ลบสำเร็จบางใบก็ยังเข้าทางนี้ — ต้องบอกว่าใบไหนตกหล่น ไม่ใช่เงียบ
      const hasPoCount = data.skipped.filter((s) => s.reason === "has_po").length;
      const otherCount = data.skipped.length - hasPoCount;
      setActionError(
        data.skipped.length > 0
          ? `เคลียร์แล้ว ${data.deletedIds.length} ใบ` +
              (hasPoCount > 0 ? ` · ข้าม ${hasPoCount} ใบที่ออก PO แล้ว` : "") +
              (otherCount > 0
                ? ` · อีก ${otherCount} ใบลบไม่ได้ (ไม่มีสิทธิ์ หรือถูกลบไปก่อนแล้ว)`
                : "")
          : null
      );
      setSelectedId(null);
      setBulkIds(new Set());
      setIssuedPos([]);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["sales-purchase-orders"] });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "ลบออเดอร์ไม่สำเร็จ");
    },
  });

  /**
   * เคลียร์ SKU ตัวเดียวออกจากทุกออเดอร์ที่ยังรออนุมัติ (สิ้นเดือน) — ข้ามคลัง/ร้านทั้งหมด
   * ที่ session นี้เห็น ไม่ใช่แค่ใบที่กำลังเปิดดูอยู่ — ต่างจาก "เคลียร์สิ้นเดือน" ที่ทำงาน
   * กับใบที่ติ๊กเลือกไว้เท่านั้น
   */
  const clearSkuMutation = useMutation({
    mutationFn: async ({ skuCode, notify }: { skuCode: string; notify: boolean }) => {
      const res = await apiFetch(
        `${appPath("/api/orders/clear-sku")}?skuCode=${encodeURIComponent(skuCode)}${notify ? "" : "&notify=0"}`,
        { method: "DELETE" }
      );
      const body = (await res.json().catch(() => null)) as {
        itemsRemoved?: number;
        ordersRemoved?: number;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(friendlyError(body?.error, `เคลียร์ไม่สำเร็จ (${res.status})`));
      }
      return body!;
    },
    onSuccess: (data) => {
      toast({
        title:
          (data.itemsRemoved ?? 0) > 0
            ? `เคลียร์สินค้าแล้ว ${data.itemsRemoved} บรรทัด`
            : "ไม่พบสินค้านี้ในออเดอร์รออนุมัติ",
        detail:
          (data.ordersRemoved ?? 0) > 0
            ? `ลบทั้งใบไปด้วย ${data.ordersRemoved} ใบ (ไม่เหลือรายการ)`
            : undefined,
        tone: (data.itemsRemoved ?? 0) > 0 ? "success" : "info",
      });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-pending-count"] });
    },
    onError: (err) => {
      toast({
        title: "เคลียร์ไม่สำเร็จ",
        detail: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (payload: {
      orderId: string;
      action: string;
      reason?: string;
      itemId?: string;
      unitPriceOverride?: number | null;
      finalQty?: number;
      skuCode?: string;
      assignments?: { itemId: string; poGroup: string }[];
      itemIds?: string[];
    }) => {
      const res = await apiFetch(appPath("/api/orders"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        const issues = (data as { issues?: unknown } | null)?.issues;
        const detail = Array.isArray(issues) ? ` — ${issues.join(" · ")}` : "";
        throw new Error(
          (typeof data?.error === "string"
            ? data.error
            : `ดำเนินการไม่สำเร็จ (${res.status})`) + detail
        );
      }
      return res.json();
    },
    onSuccess: (data) => {
      setActionError(null);
      // เลข PO ที่ออกจริง — โชว์ให้พนักงานเห็นแทนการทิ้งไป
      const pos = (data as { purchaseOrders?: typeof issuedPos } | null)
        ?.purchaseOrders;
      if (Array.isArray(pos) && pos.length > 0) {
        setIssuedPos(pos);
        // แผงเลข PO ถูกล้างทันทีที่จอเด้งไปออเดอร์ใบถัดไป (effect ที่ผูกกับ selected.id)
        // toast จึงเป็นที่เดียวที่พนักงานได้เห็นเลข PO ที่เพิ่งออกจริง ๆ
        toast({
          title: `ออก PO แล้ว ${pos.length} ใบ`,
          detail: pos.map((po) => po.poNumber).join(" · "),
          tone: "success",
        });
      }
      const rest = (data as { remainderCount?: number } | null)?.remainderCount ?? 0;
      if (rest > 0) {
        toast({
          title: `อีก ${rest} รายการแยกเป็นออเดอร์ใหม่ รออนุมัติ`,
          detail: "อยู่ในรายการออเดอร์ทางซ้าย ร้านได้รับแจ้งแล้ว",
          tone: "info",
        });
      }
      setSelectedItemIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-pending-count"] });
    },
    onError: (err) => {
      setActionError(
        err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ"
      );
      /**
       * ล้มแล้วต้องดึงค่าจริงกลับมาเสมอ — ไม่งั้นจอค้างค่าที่กดไป (เช่น 21)
       * ขณะที่ฐานข้อมูลเป็นอีกค่า (20) แล้วพนักงานกดอนุมัติทับตัวเลขที่ตัวเองไม่ได้เห็น
       */
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  return (
    <PageShell
      className={cn(
        "vmi-sales-orders-page overflow-x-hidden",
        tableExpanded && "vmi-sales-orders-page--expanded"
      )}
    >
      <AppHeader
        compact
        wide
        title="ตรวจสอบออเดอร์"
        subtitle={
          salesPreview
            ? `${salesPreview.asCode} · ${salesPreview.asName}`
            : isAdmin
              ? "Admin · กรอง VDA / เซลล์"
              : (session?.salesmanName ?? session?.salesmanCode ?? session?.email ?? "")
        }
        role={session?.role ?? "sales"}
      />

      <main className="vmi-sales-orders-main mx-auto w-full min-w-0 max-w-[min(100%,96rem)] px-2 py-2 sm:px-3 sm:py-2 xl:px-6 xl:py-3">
        <SalesNav />
        {/* งานระดับทั้งหน้า ไม่ผูกกับใบที่เปิดดู — วางนอกแถบซ้ายให้เห็นทันที · ซ่อนตอนขยายตาราง */}
        <div
          className={cn(
            "mb-2 flex flex-wrap items-center justify-between gap-2",
            tableExpanded && "xl:hidden"
          )}
        >
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {statusFilter === "pending_approval" ? (
              <>
                รออนุมัติ{" "}
                <span className="font-bold text-slate-900 dark:text-slate-50">
                  {sorted.length} ใบ
                </span>
              </>
            ) : (
              <>
                แสดง{" "}
                <span className="font-bold text-slate-900 dark:text-slate-50">
                  {sorted.length} ใบ
                </span>
              </>
            )}
          </p>
          <Button
            variant="outline"
            className="h-10 border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
            onClick={() => {
              // เคลียร์ได้เฉพาะใบที่รออนุมัติ — สลับตัวกรองให้ ลิสต์ในกล่องจะได้ตรงกับที่เห็น
              if (statusFilter !== "pending_approval") setStatusFilter("pending_approval");
              setMonthEndClearOpen(true);
            }}
            disabled={deleteMutation.isPending || clearSkuMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
            เคลียร์สิ้นเดือน
          </Button>
        </div>
        {noVdaAccess && (
          <div className="mb-2 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">รหัสนี้ไม่มี VDA ที่ดูแล</p>
            <p className="mt-1 text-amber-800 dark:text-amber-300/90">
              รหัส {vdaAccess?.salesmanCode} ไม่มีในทะเบียน VDA (VDA_SALESMAN_MAP)
              {canViewAllPersonVdas
                ? " — กดปุ่มด้านล่างเพื่อดูออเดอร์ทุก VDA ของคุณ"
                : " — ไม่มีออเดอร์ให้ตรวจสอบ"}
            </p>
          </div>
        )}

        <div className={cn("vmi-sales-orders-grid", tableExpanded && "vmi-sales-orders-grid--wide")}>
        {/* ซ่อนตอนขยายตารางด้วย CSS (.vmi-sales-orders-grid--wide) — เฉพาะจอกว้าง */}
        <aside className="vmi-sales-orders-sidebar vmi-card min-w-0 p-2 sm:p-3">
          <div className="shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { value: "pending_approval", label: "รออนุมัติ" },
              { value: "approved", label: "อนุมัติแล้ว" },
              { value: "rejected", label: "ปฏิเสธ" },
              { value: "", label: "ทั้งหมด" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:px-3.5 ${
                  statusFilter === f.value
                    ? "bg-[#0f4c75] text-white dark:bg-[#1a6b9a]"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {vdaAccess?.multipleCodes && vdaAccess.codes && vdaAccess.codes.length > 1 && (
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">
                รหัสเซลล์
              </label>
              <select
                value={vdaAccess.salesmanCode ?? ""}
                disabled={switchingCode}
                onChange={(e) => void handleSalesCodeChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {vdaAccess.codes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                    {c.vdas.length > 0
                      ? ` · ${c.vdas.map((v) => v.toUpperCase()).join(", ")}`
                      : " · ไม่มี VDA"}
                  </option>
                ))}
              </select>
              {codeError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {codeError}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                1 อีเมลมีหลายรหัส — เลือกรหัสเพื่อดู VDA ที่รหัสนั้นดูแล
              </p>
            </div>
          )}

          {canViewAllPersonVdas && (
            <button
              type="button"
              onClick={() => {
                setAllPersonVdas((v) => !v);
                setVdaFilter("");
              }}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-all sm:text-sm ${
                allPersonVdas
                  ? "border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500"
              }`}
            >
              {allPersonVdas
                ? `กำลังดูทุก VDA (${personAllVdas.map((v) => v.toUpperCase()).join(", ")})`
                : `ดูออเดอร์ทุก VDA ของฉัน (${personAllVdas.length})`}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            {availableVdas.length > 0 && !allPersonVdas && (
              <label className="text-xs text-slate-500 dark:text-slate-400">
                VDA
                <select
                  value={vdaFilter}
                  onChange={(e) => setVdaFilter(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  {!isAdmin && availableVdas.length > 1 && (
                    <option value="">ทุก VDA ที่ดูแล</option>
                  )}
                  {isAdmin && <option value="">ทุก VDA</option>}
                  {availableVdas.map((vda) => (
                    <option key={vda} value={vda}>
                      {vda.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-slate-500 dark:text-slate-400">
              เรียงตาม
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "date" | "store")}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="date">วันที่</option>
                <option value="store">ร้าน</option>
              </select>
            </label>
          </div>

          {isAdmin && (
            <SalesRepFilter
              reps={salesReps}
              value={salesRepFilter}
              onChange={setSalesRepFilter}
            />
          )}
          </div>

          {/* จัดการหลายใบรวดเดียว — อนุมัติได้เฉพาะใบที่รออนุมัติ ส่วนลบได้ทุกสถานะ */}
          {sorted.length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={selectAllOnList}
                  disabled={bulkProgress != null}
                  title={
                    bulkEligible.length > 0
                      ? "ติ๊กเฉพาะออเดอร์ที่ไม่มีรายการธงแดง"
                      : "ติ๊กทุกใบในรายการนี้"
                  }
                >
                  {bulkEligible.length > 0
                    ? "เลือกทั้งหมดที่ไม่มีธงแดง"
                    : `เลือกทั้งหมด (${sorted.length})`}
                </Button>
                {deleteSelectedOrders.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setBulkIds(new Set())}
                      disabled={bulkProgress != null}
                    >
                      ล้าง
                    </Button>
                    {bulkSelectedOrders.length > 0 && (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setBulkOpen(true)}
                        disabled={bulkProgress != null}
                      >
                        อนุมัติ {bulkSelectedOrders.length} ใบ
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => setBulkDeleteOpen(true)}
                      disabled={bulkProgress != null || deleteMutation.isPending}
                      title="ลบออเดอร์ที่เลือกออกจากระบบ พร้อม PO และประวัติฝั่งร้าน"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      ลบ {deleteSelectedOrders.length} ใบ
                    </Button>
                  </>
                )}
              </div>
              {bulkProgress && (
                <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  กำลังอนุมัติ {bulkProgress.done}/{bulkProgress.total} ใบ...
                </p>
              )}
              {bulkResult && (
                <div className="mt-1.5 space-y-1 text-xs">
                  {bulkResult.ok.length > 0 && (
                    <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                      <p className="font-semibold">
                        สำเร็จ {bulkResult.ok.length} ใบ
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {bulkResult.ok.map((line) => (
                          <li key={line} className="truncate font-mono text-[11px]">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {bulkResult.failed.length > 0 && (
                    <div className="rounded bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950/40 dark:text-red-200">
                      <p className="font-semibold">
                        ไม่สำเร็จ {bulkResult.failed.length} ใบ
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {bulkResult.failed.map((f) => (
                          <li key={f.label} className="text-[11px]">
                            {f.label} — {f.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setBulkResult(null)}
                    className="text-[11px] text-slate-400 underline underline-offset-2"
                  >
                    ปิดสรุป
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="vmi-sales-orders-sidebar-scroll mt-3 space-y-2">
            {showLoading && (
              <p className="text-sm text-slate-500 dark:text-slate-400">กำลังโหลด...</p>
            )}
            {isError && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                <span>โหลดออเดอร์ไม่สำเร็จ</span>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  ลองใหม่
                </button>
              </div>
            )}
            {!showLoading && !isError && sorted.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {noVdaAccess
                    ? "ไม่มีออเดอร์ — รหัสนี้ไม่มี VDA"
                    : allPersonVdas
                      ? "ไม่มีออเดอร์ในสถานะนี้ (ทุก VDA)"
                      : "ไม่มีออเดอร์ในสถานะนี้"}
                </p>
              </div>
            )}
            {sorted.map((order) => {
              const label = formatStoreLabel(order.store.code, order.store.name);
              const skuCount = order.items?.length ?? 0;
              const priceFlagged =
                order.items?.filter((i) => i.priceFlagged).length ?? 0;
              const canBulk = bulkEligible.some((o) => o.id === order.id);
              const redCount = orderRedFlagCount(order);
              return (
              <div
                key={order.id}
                id={`sales-order-${order.id}`}
                className={`relative w-full rounded-xl border p-3 text-left transition-all ${
                  selected?.id === order.id
                    ? "border-teal-300 bg-teal-50/50 shadow-sm dark:border-teal-600 dark:bg-teal-950/35"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                }`}
              >
                {/* checkbox แยกจากปุ่มเลือกดู ไม่งั้นติ๊กแล้วเปลี่ยนออเดอร์ที่กำลังดูไปด้วย
                    มีทุกใบ เพราะใบที่อนุมัติไม่ได้ก็ยังเลือกเพื่อลบได้ */}
                <div className="absolute right-2.5 top-2.5 z-10">
                  <Checkbox
                    checked={bulkIds.has(order.id)}
                    onCheckedChange={() => toggleBulk(order.id)}
                    aria-label={
                      canBulk
                        ? `เลือก ${label} เพื่ออนุมัติหรือลบ`
                        : `เลือก ${label} เพื่อลบ`
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(order.id)}
                  className="w-full text-left"
                >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {label}
                  </span>
                  <span className="mr-7">
                    <StatusBadge status={order.status} />
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {skuCount > 0 ? `${skuCount} SKU · ` : ""}
                  {new Date(order.createdAt).toLocaleString("th-TH", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
                {priceFlagged > 0 && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800">
                    <AlertTriangle className="h-3 w-3" /> ราคาต่างระบบ{" "}
                    {priceFlagged}
                  </span>
                )}
                {redCount > 0 && order.status === "pending_approval" && (
                  <span className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800">
                    ธงแดง {redCount}
                  </span>
                )}
                {isAdmin && order.store.salesRep && (
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {order.store.salesRep.name}
                  </p>
                )}
                </button>
              </div>
            );
            })}
          </div>
        </aside>

        <section className="vmi-sales-orders-detail vmi-card-elevated min-w-0 p-2 sm:p-3 xl:p-4">
          {!selected ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">เลือกออเดอร์เพื่อดูรายละเอียด</p>
          ) : (
            <>
              <div className="vmi-sales-order-head mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                      {formatStoreLabel(selected.store.code, selected.store.name)}
                    </h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {selected.items.length} SKU ·{" "}
                      {new Date(selected.createdAt).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  {isAdmin && selected.store.salesRep && (
                    <p className="mt-0.5 text-[11px] text-teal-700 dark:text-teal-400">
                      เซลล์: {selected.store.salesRep.name}
                    </p>
                  )}
                </div>
                {/* ปุ่มลบอยู่ตรงหัวเรื่อง ไม่ใช่แถบล่าง เพราะแถบล่างมีเฉพาะใบที่รออนุมัติ
                    แต่ใบที่อนุมัติ/ปฏิเสธแล้วก็ต้องลบได้ตอนล้างประวัติ */}
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                    disabled={
                      actionMutation.isPending || deleteMutation.isPending
                    }
                    title="ลบออเดอร์นี้ออกจากระบบ พร้อม PO และประวัติที่ร้านเห็น"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    ลบ
                  </Button>
                </div>
              </div>

              {selected.items.some((i) => i.priceFlagged) && (
                <div className="mb-2 flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {/*
                    ธงนี้ขึ้นเมื่อราคาบนบรรทัดต่างจากราคาระบบ ไม่ว่าใครเป็นคนตั้ง
                    — เซลล์ที่แก้ราคาเองในหน้านี้ก็ทำให้ขึ้นได้ ข้อความเดิมเขียนว่า
                    "ร้านแก้ราคา" จึงโยนความผิดให้ร้านทั้งที่บางบรรทัดเซลล์แก้เอง
                  */}
                  <span>
                    ราคา/หีบ{" "}
                    {selected.items.filter((i) => i.priceFlagged).length}{" "}
                    รายการไม่ตรงกับราคาในระบบ (ร้านตั้งมา หรือแก้ในหน้านี้) —
                    ตรวจสอบก่อนอนุมัติ
                  </span>
                </div>
              )}

              {selected.status === "pending_approval" && (
                <div className="mb-2 shrink-0">
                  <PoSplitPanel
                    items={selected.items}
                    selectedIds={selectedItemIds}
                    pending={actionMutation.isPending}
                    onAssign={(groupKey, itemIds) =>
                      actionMutation.mutate({
                        orderId: selected.id,
                        action: "assignPoGroup",
                        assignments: assignmentsFor(selected.items, groupKey, itemIds),
                      })
                    }
                  />
                </div>
              )}

              {issuedPos.length > 0 && (
                <div className="mb-2 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    ออก PO แล้ว {issuedPos.length} ใบ
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {issuedPos.map((po) => (
                      <li
                        key={po.poNumber}
                        className="text-[11px] tabular-nums text-emerald-800 dark:text-emerald-300"
                      >
                        <span className="font-mono font-bold">{po.poNumber}</span>{" "}
                        · {po.label} · {po.itemCount} รายการ · {po.totalQty} หีบ
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <OrderReviewTable
                storeCode={selected.store.code}
                items={selected.items}
                showPoGroups={selected.status === "pending_approval"}
                selectedIds={selectedItemIds}
                onToggleSelect={
                  selected.status === "pending_approval"
                    ? toggleItemSelect
                    : undefined
                }
                onSelectMany={
                  selected.status === "pending_approval"
                    ? selectManyItems
                    : undefined
                }
                onPriceChange={
                  selected.status === "pending_approval"
                    ? (itemId, unitPriceOverride) =>
                        actionMutation.mutate({
                          orderId: selected.id,
                          action: "updatePrice",
                          itemId,
                          unitPriceOverride,
                        })
                    : undefined
                }
                onQtyChange={
                  selected.status === "pending_approval"
                    ? (itemId, finalQty) =>
                        actionMutation.mutate({
                          orderId: selected.id,
                          action: "updateQty",
                          itemId,
                          finalQty,
                        })
                    : undefined
                }
                onRejectItem={
                  selected.status === "pending_approval"
                    ? (itemId, reason) =>
                        actionMutation.mutate({
                          orderId: selected.id,
                          action: "rejectItem",
                          itemId,
                          reason,
                        })
                    : undefined
                }
                onAddItem={
                  selected.status === "pending_approval"
                    ? (skuCode, finalQty) =>
                        actionMutation.mutate({
                          orderId: selected.id,
                          action: "addItem",
                          skuCode,
                          finalQty,
                        })
                    : undefined
                }
                addItemPending={actionMutation.isPending}
                expanded={tableExpanded}
                onToggleExpand={toggleTableExpanded}
              />

              {actionError && (
                <p className="mt-2 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  {actionError}
                </p>
              )}

              {selected.status === "pending_approval" && (
                <>
                  <div
                    className="shrink-0 xl:hidden"
                    style={{
                      // แถบปุ่มลอยสูงขึ้นเมื่อมีบรรทัดบอกเหตุที่อนุมัติไม่ได้ — กันเนื้อหาจมใต้แถบ
                      height:
                        pendingConfirmCount(selected.items) > 0
                          ? "max(7rem, calc(6rem + env(safe-area-inset-bottom)))"
                          : "max(4.5rem, calc(3.5rem + env(safe-area-inset-bottom)))",
                    }}
                    aria-hidden
                  />
                  <div className="vmi-sales-action-bar flex flex-wrap gap-2 max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-50 max-xl:border-t max-xl:border-slate-200 max-xl:p-3 max-xl:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-xl:shadow-[0_-4px_20px_rgb(0_0_0/0.06)] dark:max-xl:border-slate-700 xl:mt-2 xl:flex-wrap xl:border-t xl:border-slate-200 xl:pt-2 dark:xl:border-slate-700">
                    {/* อยู่ในแถบปุ่มเลย — บนมือถือแถบนี้ลอยแยกจากเนื้อหา ถ้าวางไว้ข้างบนจะเห็นแต่ปุ่มจาง */}
                    {pendingConfirmCount(approveItems) > 0 && (
                      <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        มี {pendingConfirmCount(approveItems)} รายการที่รอร้านยืนยัน —
                        อนุมัติได้เมื่อร้านตอบครบแล้ว
                        {partialItems && " (หรือเอาติ๊กรายการนั้นออก)"}
                      </p>
                    )}
                    {partialItems && pendingConfirmCount(approveItems) === 0 && (
                      <p className="w-full rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
                        เลือกไว้ {partialItems.length} จาก {selected.items.length} รายการ —
                        อีก {selected.items.length - partialItems.length} รายการจะแยกเป็นออเดอร์ใหม่รออนุมัติ
                      </p>
                    )}
                    {/* บอกให้เห็นก่อนกดว่าจะออก PO ยอดเท่าไร — ปุ่มเดิมไม่มีตัวเลขเลย */}
                    <p className="w-full text-sm text-slate-600 xl:order-last xl:ml-auto xl:w-auto xl:self-center dark:text-slate-300">
                      จะออก PO{" "}
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        {approveTotals.count} รายการ · {approveTotals.qty.toLocaleString("th-TH")} หีบ
                      </span>{" "}
                      · มูลค่า{" "}
                      <span className="text-base font-bold text-teal-700 dark:text-teal-400">
                        {approveTotals.amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท
                      </span>
                    </p>
                    <Button
                      variant="destructive"
                      className="max-xl:flex-1"
                      disabled={actionMutation.isPending}
                      onClick={() => setRejectOpen(true)}
                    >
                      ปฏิเสธ
                    </Button>
                    <Button
                      variant="success"
                      className="max-xl:flex-1"
                      onClick={() => {
                        // ออเดอร์ที่ร้านตั้งราคาเองต้องยืนยันอีกชั้น — ฝั่งร้านยังต้อง
                        // ยืนยันสองรอบกว่าจะส่งได้ แต่เดิมฝั่งเซลส์อนุมัติจบด้วยคลิกเดียว
                        // ทั้งที่เป็นขั้นที่ออกเลข PO จริงและย้อนกลับไม่ได้
                        // อนุมัติบางรายการต้องยืนยันเสมอ — แยกใบแล้วพนักงานรวมกลับเองไม่ได้
                        if (approveNeedsConfirm || partialItems) setApproveOpen(true);
                        else
                          actionMutation.mutate({
                            orderId: selected.id,
                            action: "approve",
                          });
                      }}
                      // กั้นจากฝั่ง client ด้วย — เซิร์ฟเวอร์ยังตรวจซ้ำเสมอ
                      disabled={
                        actionMutation.isPending ||
                        poSplitIssues(approveItems).length > 0 ||
                        pendingConfirmCount(approveItems) > 0
                      }
                    >
                      {partialItems
                        ? `อนุมัติเฉพาะที่เลือก (${partialItems.length}) → ออก PO`
                        : poSplitCount(selected.items) > 1
                          ? `อนุมัติ → ออก ${poSplitCount(selected.items)} PO`
                          : "อนุมัติ → ออก PO"}
                    </Button>
                  </div>
                </>
              )}

              {selected.status === "approved" && issuedPos.length === 0 && (
                <p className="mt-4 text-sm text-green-700 dark:text-green-400">
                  อนุมัติแล้ว — ออก PO เรียบร้อย
                </p>
              )}

              <ConfirmDialog
                open={deleteOpen}
                title="ลบออเดอร์นี้?"
                body={
                  <>
                    <p>
                      ออเดอร์ของ{" "}
                      <span className="font-medium">
                        {formatStoreLabel(
                          selected.store.code,
                          selected.store.name
                        )}
                      </span>{" "}
                      ({selected.items.length} รายการ) จะถูกลบออกจากระบบถาวร
                    </p>
                    {selected.status === "approved" && (
                      <p className="mt-1.5 font-semibold text-amber-700 dark:text-amber-400">
                        ออเดอร์นี้อนุมัติแล้ว — PO ที่ออกไปจะถูกลบไปด้วย
                      </p>
                    )}
                    <p className="mt-1.5">
                      ประวัติที่ร้านเห็นในหน้า
                      &quot;ประวัติการสั่งซื้อ&quot;
                      และแจ้งเตือนเดิมของออเดอร์นี้จะถูกลบด้วย · ย้อนกลับไม่ได้
                    </p>
                    <NotifyStoreCheckbox
                      checked={notifyStores}
                      onChange={setNotifyStores}
                    />
                  </>
                }
                confirmLabel="ลบออเดอร์"
                onConfirm={async () => {
                  await deleteMutation.mutateAsync({
                    orderIds: [selected.id],
                    notify: notifyStores,
                    allowIssuedPo: true,
                  });
                }}
                onClose={() => setDeleteOpen(false)}
              />

              <RejectOrderModal
                open={rejectOpen}
                storeLabel={formatStoreLabel(
                  selected.store.code,
                  selected.store.name
                )}
                itemCount={selected.items.length}
                redFlagCount={orderRedFlagCount(selected)}
                pending={actionMutation.isPending}
                onClose={() => setRejectOpen(false)}
                onConfirm={(reason) => {
                  setRejectOpen(false);
                  actionMutation.mutate({
                    orderId: selected.id,
                    action: "reject",
                    reason: reason || undefined,
                  });
                }}
              />

              {selected.status === "rejected" && selected.rejectReason && (
                <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                  เหตุผล: {selected.rejectReason}
                </p>
              )}
            </>
          )}
        </section>
        </div>
      </main>

      <ConfirmDialog
        open={approveOpen}
        tone="default"
        title={
          partialItems
            ? `อนุมัติเฉพาะ ${partialItems.length} รายการที่เลือก?`
            : "อนุมัติออเดอร์ที่ราคาไม่ตรงระบบ?"
        }
        confirmLabel="อนุมัติและออก PO"
        body={
          <>
            {partialItems && selected && (
              <p className="mb-2">
                ออก PO ให้ {partialItems.length} รายการที่เลือก · อีก{" "}
                <span className="font-semibold">
                  {selected.items.length - partialItems.length} รายการ
                </span>{" "}
                จะแยกเป็นออเดอร์ใหม่ของร้านเดิม สถานะรออนุมัติ และร้านจะได้รับแจ้ง
              </p>
            )}
            {approveItems.some((i) => i.priceFlagged) && (
              <p>
                มี{" "}
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {approveItems.filter((i) => i.priceFlagged).length} รายการที่ราคาต่างจากระบบ
                </span>{" "}
                — ราคาที่แสดงอยู่ตอนนี้จะถูกใช้บนเอกสาร PO ที่ส่งฝ่ายจัดซื้อ กรุณาตรวจราคาอีกครั้ง
              </p>
            )}
            <p className="mt-2 text-slate-500">เมื่อออกเลข PO แล้วย้อนกลับไม่ได้</p>
          </>
        }
        onClose={() => setApproveOpen(false)}
        onConfirm={() => {
          setApproveOpen(false);
          if (selected) {
            actionMutation.mutate({
              orderId: selected.id,
              action: "approve",
              ...(partialItems ? { itemIds: partialItems.map((i) => i.id) } : {}),
            });
          }
        }}
      />

      <ConfirmDialog
        open={bulkOpen}
        tone="default"
        title={`อนุมัติ ${bulkSelectedOrders.length} ออเดอร์?`}
        body={
          <>
            ระบบจะออก PO ให้ทุกใบตามที่แบ่งกลุ่มไว้ และแจ้งร้านทีละใบ
            {bulkSelectedOrders.some((o) => orderRedFlagCount(o) > 0) && (
              <>
                <br />
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  มี{" "}
                  {
                    bulkSelectedOrders.filter((o) => orderRedFlagCount(o) > 0)
                      .length
                  }{" "}
                  ใบที่ยังมีรายการธงแดง
                </span>
              </>
            )}
            <br />
            อนุมัติแล้วย้อนกลับไม่ได้
          </>
        }
        confirmLabel="อนุมัติทั้งหมด"
        onConfirm={async () => {
          await runBulkApprove();
        }}
        onClose={() => setBulkOpen(false)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`ลบ ${deleteSelectedOrders.length} ออเดอร์?`}
        body={
          <>
            <p>
              ออเดอร์ที่เลือกจะถูกลบออกจากระบบถาวร พร้อมรายการสินค้า
              ประวัติที่ร้านเห็น และแจ้งเตือนเดิมของออเดอร์เหล่านั้น
            </p>
            {deleteSelectedApproved > 0 && (
              <p className="mt-1.5 font-semibold text-amber-700 dark:text-amber-400">
                มี {deleteSelectedApproved} ใบที่อนุมัติแล้ว — PO ที่ออกไป
                จะถูกลบไปด้วย
              </p>
            )}
            <p className="mt-1.5">ย้อนกลับไม่ได้</p>
            <NotifyStoreCheckbox
              checked={notifyStores}
              onChange={setNotifyStores}
            />
          </>
        }
        confirmLabel={`ลบ ${deleteSelectedOrders.length} ใบ`}
        onConfirm={async () => {
          await deleteMutation.mutateAsync({
            orderIds: deleteSelectedOrders.map((o) => o.id),
            notify: notifyStores,
            allowIssuedPo: true,
          });
        }}
        onClose={() => setBulkDeleteOpen(false)}
      />

      <MonthEndClearModal
        open={monthEndClearOpen}
        onClose={() => setMonthEndClearOpen(false)}
        busy={deleteMutation.isPending || clearSkuMutation.isPending}
        orders={sorted
          .filter((o) => o.status === "pending_approval")
          .map((o) => ({
            id: o.id,
            label: formatStoreLabel(o.store.code, o.store.name),
            createdAt: o.createdAt,
            skuCodes: o.items.map((i) => i.sku.code),
          }))}
        onClearOrders={async (orderIds, notify) => {
          await deleteMutation.mutateAsync({ orderIds, notify, allowIssuedPo: false });
          toast({ title: `เคลียร์สิ้นเดือนแล้ว ${orderIds.length} ใบ`, tone: "success" });
        }}
        onClearSku={async (skuCode, notify) => {
          await clearSkuMutation.mutateAsync({ skuCode, notify });
        }}
      />
    </PageShell>
  );
}
