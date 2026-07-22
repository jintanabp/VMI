"use client";

import { appPath } from "@/lib/paths";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSalesSession } from "@/hooks/use-sales-session";
import { useSalesPreview } from "@/hooks/use-sales-preview";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { SalesNav } from "./sales-nav";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SalesRepFilter } from "@/components/sales/sales-rep-filter";
import { OrderReviewTable } from "@/components/sales/order-review-table";
import { formatStoreLabel } from "@/lib/format-store-label";

interface OrderItem {
  id: string;
  finalQty: number;
  suggestedQty: number;
  cvdEstimate: number | null;
  minDays?: number | null;
  maxDays?: number | null;
  sku: { code: string; name: string };
}

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
  const [allPersonVdas, setAllPersonVdas] = useState(false);

  const { data: vdaAccess } = useQuery<{
    hasVdaAccess: boolean;
    vdas: string[];
    allPersonVdas?: string[];
    hasAnyPersonVda?: boolean;
    salesmanCode?: string;
    salesmanName?: string;
    isAdmin?: boolean;
    vdaRegistryLoaded?: boolean;
    multipleCodes?: boolean;
    codes?: Array<{
      code: string;
      name: string;
      vdas: string[];
      hasVdaAccess: boolean;
    }>;
  }>({
    queryKey: ["sales-vda-access"],
    queryFn: () => fetch(appPath("/api/sales/vda-access")).then((r) => r.json()),
    enabled: !!session && session.role !== "admin",
  });

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
    queryFn: () => fetch(appPath("/api/admin/salesmen")).then((r) => r.json()),
    enabled: isAdmin,
  });

  const { data: vdaSources = [] } = useQuery<string[]>({
    queryKey: ["vda-sources"],
    queryFn: () =>
      fetch(appPath("/api/vda"))
        .then((r) => r.json())
        .then((d) => (Array.isArray(d.sources) ? d.sources : [])),
    enabled: isAdmin,
  });

  const availableVdas = useMemo(() => {
    if (isAdmin) return vdaSources;
    return vdaAccess?.vdas ?? [];
  }, [isAdmin, vdaSources, vdaAccess?.vdas]);

  useEffect(() => {
    if (isAdmin || availableVdas.length === 0 || vdaFilter) return;
    setVdaFilter(availableVdas[0]);
  }, [availableVdas, vdaFilter, isAdmin]);

  async function handleSalesCodeChange(code: string) {
    if (!code || code === vdaAccess?.salesmanCode || switchingCode) return;
    setSwitchingCode(true);
    try {
      const res = await fetch(appPath("/api/sales/active-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "เปลี่ยนรหัสไม่สำเร็จ");
      }
      setVdaFilter("");
      setAllPersonVdas(false);
      queryClient.invalidateQueries({ queryKey: ["sales-vda-access"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      window.location.reload();
    } catch {
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
    return `/api/orders${qs ? `?${qs}` : ""}`;
  }, [statusFilter, salesRepFilter, vdaFilter, allPersonVdas, isAdmin]);

  const {
    data: orders = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Order[]>({
    queryKey: ["orders", statusFilter, salesRepFilter, vdaFilter, allPersonVdas, isAdmin],
    queryFn: async () => {
      const res = await fetch(ordersUrl);
      if (!res.ok) throw new Error(`โหลดออเดอร์ไม่สำเร็จ (${res.status})`);
      return (await res.json()) as Order[];
    },
  });

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

  const actionMutation = useMutation({
    mutationFn: async (payload: {
      orderId: string;
      action: string;
      reason?: string;
    }) => {
      const res = await fetch(appPath("/api/orders"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("action failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  return (
    <PageShell className="vmi-sales-orders-page overflow-x-hidden">
      <AppHeader
        compact
        title="ตรวจสอบคำสั่งซื้อ"
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
        {noVdaAccess && (
          <div className="mb-2 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">รหัสนี้ไม่มี VDA ที่ดูแล</p>
            <p className="mt-1 text-amber-800 dark:text-amber-300/90">
              รหัส {vdaAccess?.salesmanCode} ไม่มีใน vda_aos_bill
              {canViewAllPersonVdas
                ? " — กดปุ่มด้านล่างเพื่อดูออเดอร์ทุก VDA ของคุณ"
                : " — ไม่มีออเดอร์ให้ตรวจสอบ"}
            </p>
          </div>
        )}

        <div className="vmi-sales-orders-grid">
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
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:px-3.5 ${
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

          {availableVdas.length > 0 && !allPersonVdas && (
            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">
                VDA
              </label>
              <select
                value={vdaFilter}
                onChange={(e) => setVdaFilter(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
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
            </div>
          )}

          {isAdmin && (
            <SalesRepFilter
              reps={salesReps}
              value={salesRepFilter}
              onChange={setSalesRepFilter}
            />
          )}

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">เรียงตาม</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "store")}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="date">วันที่</option>
              <option value="store">ร้าน</option>
            </select>
          </div>
          </div>

          <div className="vmi-sales-orders-sidebar-scroll mt-3 space-y-2">
            {isLoading && (
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
            {!isLoading && !isError && sorted.length === 0 && (
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
              return (
              <button
                key={order.id}
                onClick={() => setSelectedId(order.id)}
                className={`w-full rounded-xl border p-3 text-left transition-all ${
                  selected?.id === order.id
                    ? "border-teal-300 bg-teal-50/50 shadow-sm dark:border-teal-600 dark:bg-teal-950/35"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {label}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {skuCount > 0 ? `${skuCount} SKU · ` : ""}
                  {new Date(order.createdAt).toLocaleString("th-TH", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
                {isAdmin && order.store.salesRep && (
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {order.store.salesRep.name}
                  </p>
                )}
              </button>
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
                <StatusBadge status={selected.status} />
              </div>

              <OrderReviewTable
                storeCode={selected.store.code}
                items={selected.items}
              />

              {selected.status === "pending_approval" && (
                <>
                  <div
                    className="shrink-0 xl:hidden"
                    style={{ height: "max(4.5rem, calc(3.5rem + env(safe-area-inset-bottom)))" }}
                    aria-hidden
                  />
                  <div className="vmi-sales-action-bar flex gap-2 max-xl:fixed max-xl:inset-x-0 max-xl:bottom-0 max-xl:z-50 max-xl:border-t max-xl:border-slate-200 max-xl:p-3 max-xl:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-xl:shadow-[0_-4px_20px_rgb(0_0_0/0.06)] dark:max-xl:border-slate-700 xl:mt-2 xl:flex-wrap xl:border-t xl:border-slate-200 xl:pt-2 dark:xl:border-slate-700">
                    <Button
                      variant="destructive"
                      className="max-xl:flex-1"
                      onClick={() => {
                        const reason = prompt("เหตุผลในการปฏิเสธ (ถ้ามี)");
                        actionMutation.mutate({
                          orderId: selected.id,
                          action: "reject",
                          reason: reason ?? undefined,
                        });
                      }}
                    >
                      ปฏิเสธ
                    </Button>
                    <Button
                      variant="success"
                      className="max-xl:flex-1"
                      onClick={() =>
                        actionMutation.mutate({
                          orderId: selected.id,
                          action: "approve",
                        })
                      }
                      disabled={actionMutation.isPending}
                    >
                      อนุมัติ → ส่ง PO
                    </Button>
                  </div>
                </>
              )}

              {selected.status === "approved" && (
                <p className="mt-4 text-sm text-green-700 dark:text-green-400">
                  อนุมัติแล้ว — ส่งไป PO (stub) เรียบร้อย
                </p>
              )}

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
    </PageShell>
  );
}
