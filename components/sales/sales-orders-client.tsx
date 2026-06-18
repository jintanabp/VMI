"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSalesSession } from "@/hooks/use-sales-session";
import { useSalesPreview } from "@/hooks/use-sales-preview";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { FlagBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SalesRepFilter } from "@/components/sales/sales-rep-filter";
import { formatDays } from "@/lib/calculations";
import { getCvdFlag } from "@/lib/calculations";

interface OrderItem {
  id: string;
  finalQty: number;
  suggestedQty: number;
  cvdEstimate: number | null;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "store">("date");

  const { data: salesReps = [] } = useQuery<SalesRep[]>({
    queryKey: ["admin-salesmen"],
    queryFn: () => fetch("/api/admin/salesmen").then((r) => r.json()),
    enabled: isAdmin,
  });

  const ordersUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (isAdmin && salesRepFilter) params.set("salesRepId", salesRepFilter);
    const qs = params.toString();
    return `/api/orders${qs ? `?${qs}` : ""}`;
  }, [statusFilter, salesRepFilter, isAdmin]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["orders", statusFilter, salesRepFilter, isAdmin],
    queryFn: () => fetch(ordersUrl).then((r) => r.json()),
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
      const res = await fetch("/api/orders", {
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
    <PageShell>
      <AppHeader
        title="ตรวจสอบคำสั่งซื้อ"
        subtitle={
          salesPreview
            ? `มุมมองทดสอบ — ${salesPreview.asCode} · ${salesPreview.asName}`
            : isAdmin
              ? "Admin — ดูออเดอร์ทั้งหมดหรือกรองตามเซลล์"
              : session?.salesmanCode
                ? `${session.salesmanName ?? session.salesmanCode} · ${session.email}`
                : session?.email ?? ""
        }
        role={session?.role ?? "sales"}
      />

      <main className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6 lg:grid-cols-[320px_1fr]">
        <aside className="vmi-card p-3 sm:p-4 lg:p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
                    ? "bg-gradient-to-r from-[#0f4c75] to-[#0e7490] text-white shadow-md"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <SalesRepFilter
              reps={salesReps}
              value={salesRepFilter}
              onChange={setSalesRepFilter}
            />
          )}

          <div className="mb-3">
            <label className="text-xs text-slate-500 dark:text-slate-400">เรียงตาม</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "store")}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="date">วันที่</option>
              <option value="store">ร้านค้า</option>
            </select>
          </div>

          <div className="space-y-2">
            {isLoading && (
              <p className="text-sm text-slate-500 dark:text-slate-400">กำลังโหลด...</p>
            )}
            {!isLoading && sorted.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  ไม่มีออเดอร์ในสถานะนี้
                </p>
              </div>
            )}
            {sorted.map((order) => (
              <button
                key={order.id}
                onClick={() => setSelectedId(order.id)}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  selected?.id === order.id
                    ? "border-teal-300 bg-teal-50/50 shadow-sm dark:border-teal-600 dark:bg-teal-950/35"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {order.store.code}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.store.name}</p>
                {isAdmin && order.store.salesRep && (
                  <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-400">
                    เซลล์: {order.store.salesRep.name}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {new Date(order.createdAt).toLocaleString("th-TH")}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="vmi-card-elevated p-4 sm:p-6">
          {!selected ? (
            <p className="text-slate-500 dark:text-slate-400">เลือกออเดอร์เพื่อดูรายละเอียด</p>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                    {selected.store.code} - {selected.store.name}
                  </h2>
                  {isAdmin && selected.store.salesRep && (
                    <p className="mt-1 text-sm text-teal-700 dark:text-teal-400">
                      เซลล์ดูแล: {selected.store.salesRep.name} ({selected.store.salesRep.email})
                    </p>
                  )}
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    ส่งเมื่อ:{" "}
                    {new Date(selected.createdAt).toLocaleString("th-TH")}
                  </p>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <div className="space-y-3">
                {selected.items.map((item) => {
                  const flag = getCvdFlag(item.cvdEstimate);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {item.sku.code} - {item.sku.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          แนะนำ {item.suggestedQty} หีบ → สั่ง {item.finalQty}{" "}
                          หีบ
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          CVD Est. {formatDays(item.cvdEstimate)}
                        </span>
                        <FlagBadge flag={flag} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {selected.status === "pending_approval" && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    variant="destructive"
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
      </main>
    </PageShell>
  );
}
