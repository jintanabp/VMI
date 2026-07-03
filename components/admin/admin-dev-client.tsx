"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  RefreshCw,
  Search,
  Shield,
  Users,
  Warehouse,
} from "lucide-react";
import { useSalesSession } from "@/hooks/use-sales-session";
import {
  getPeopleWithVda,
  useVdaSalesDirectory,
  type PersonVdaRow,
} from "@/hooks/use-vda-sales-directory";
import { useAdminPreview } from "@/hooks/use-admin-preview";
import { useSalesPreview } from "@/hooks/use-sales-preview";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { CustomerLoginForm } from "@/components/auth/customer-login-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { VdaSalesAccessPanel } from "@/components/admin/vda-sales-access-panel";

type SalesPreviewScope = "with_vda" | "all";
type AdminTab = "vda" | "sales" | "settings";

const ADMIN_TABS: {
  id: AdminTab;
  label: string;
  icon: typeof Warehouse;
}[] = [
  { id: "vda", label: "มุมมอง VDA", icon: Warehouse },
  { id: "sales", label: "มุมมองเซลล์", icon: Users },
  { id: "settings", label: "ตั้งค่าระบบ", icon: Shield },
];

function filterPreviewPeople(rows: PersonVdaRow[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.allVdas.some((v) => v.includes(q)) ||
      p.codes.some(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.vdas.some((v) => v.includes(q))
      )
  );
}

function FabricSyncStatus() {
  const [data, setData] = useState<{
    schedulerEnabled?: boolean;
    status?: {
      lastSuccessAt?: string;
      lastFailureAt?: string;
      lastError?: string;
    };
    cacheFiles?: Record<string, string | null>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/refresh-status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);

  const fmt = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleString("th-TH", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";

  return (
    <div className="mb-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/50">
      <p>
        <span className="text-slate-500">Scheduler:</span>{" "}
        <span className="font-semibold">
          {data?.schedulerEnabled ? "เปิด (03:30 น.)" : "ปิด"}
        </span>
      </p>
      <p>
        <span className="text-slate-500">Sync สำเร็จล่าสุด:</span>{" "}
        {fmt(data?.status?.lastSuccessAt)}
      </p>
      {data?.status?.lastFailureAt && (
        <p className="text-amber-700 dark:text-amber-400">
          ล้มเหลวล่าสุด: {fmt(data.status.lastFailureAt)}
          {data.status.lastError ? ` — ${data.status.lastError}` : ""}
        </p>
      )}
    </div>
  );
}

function RefreshMastersButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/refresh-masters", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setMsg(
        `สำเร็จ — customer: ${data.customer ? "OK" : "-"}, salesman: ${data.salesman ? "OK" : "-"}, promo: ${data.promotion ? "OK" : "-"}, sku: ${data.skuMaster ? "OK" : "-"}, stock: ${data.stockCover ? "OK" : "-"}, vdaBill: ${data.vdaAos ? "OK" : "-"}`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "ล้มเหลว");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full sm:w-auto" onClick={refresh} disabled={loading}>
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        {loading ? "กำลังดึงจาก Fabric..." : "ดึงข้อมูล master ตอนนี้"}
      </Button>
      {msg && <p className="text-sm text-slate-600 dark:text-slate-400">{msg}</p>}
    </div>
  );
}

function AdminEmailsSection() {
  const [admins, setAdmins] = useState<
    { email: string; fromEnv: boolean; addedBy: string }[]
  >([]);
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/admins")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAdmins(Array.isArray(data) ? data : []));
  }, []);

  async function reload() {
    const data = await fetch("/api/admin/admins").then((r) => r.json());
    setAdmins(Array.isArray(data) ? data : []);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ผู้ดูแลระบบ (Admin)</CardTitle>
        <CardDescription>
          อีเมลใน <code className="text-xs">ADMIN_EMAILS</code> /{" "}
          <code className="text-xs">APP_ADMINS</code> ใน .env จะถูก seed อัตโนมัติ
          (ลบผ่าน UI ไม่ได้)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="flex-1"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="เพิ่มอีเมล admin เช่น name@sahapat.co.th"
          />
          <Button
            onClick={async () => {
              setMsg("");
              const email = newEmail.trim();
              if (!email) return;
              const res = await fetch("/api/admin/admins", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const data = await res.json();
              if (!res.ok) {
                setMsg(data.error ?? "เพิ่มไม่สำเร็จ");
                return;
              }
              setNewEmail("");
              setMsg(`เพิ่ม ${email} แล้ว`);
              await reload();
            }}
          >
            เพิ่ม
          </Button>
        </div>
        {msg && <p className="text-sm text-slate-600 dark:text-slate-400">{msg}</p>}
        <ul className="space-y-2">
          {admins.map((a) => (
            <li
              key={a.email}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {a.email}
                  {a.fromEnv && (
                    <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                      .env
                    </span>
                  )}
                </p>
                {a.addedBy && a.addedBy !== "<bootstrap>" && (
                  <p className="text-xs text-slate-500">เพิ่มโดย {a.addedBy}</p>
                )}
              </div>
              {!a.fromEnv && (
                <button
                  type="button"
                  className="shrink-0 text-xs text-slate-500 hover:text-red-600"
                  onClick={async () => {
                    if (!window.confirm(`ลบ ${a.email} ออกจาก admin?`)) return;
                    await fetch(
                      `/api/admin/admins?email=${encodeURIComponent(a.email)}`,
                      { method: "DELETE" }
                    );
                    await reload();
                  }}
                >
                  ลบ
                </button>
              )}
            </li>
          ))}
          {admins.length === 0 && (
            <p className="text-sm text-slate-500">ยังไม่มี admin ในระบบ</p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AdminDevClient() {
  const { session, loading: sessionLoading } = useSalesSession();
  const adminPreview = useAdminPreview();
  const salesPreview = useSalesPreview();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("vda");
  const {
    data: salesDirectory,
    loading: salesDirectoryLoading,
    error: salesDirectoryError,
  } = useVdaSalesDirectory(session?.role === "admin");
  const [repSearch, setRepSearch] = useState("");
  const [repScope, setRepScope] = useState<SalesPreviewScope>("with_vda");

  const peopleWithVda = useMemo(
    () => getPeopleWithVda(salesDirectory),
    [salesDirectory]
  );

  const filteredReps = useMemo(() => {
    const base =
      repScope === "with_vda" ? peopleWithVda : (salesDirectory?.people ?? []);
    const filtered = filterPreviewPeople(base, repSearch);
    if (repScope === "all" && !repSearch.trim()) return filtered.slice(0, 50);
    return filtered;
  }, [salesDirectory, repSearch, repScope, peopleWithVda]);

  async function startSalesPreview(email: string, code?: string) {
    const codeOnly =
      email.startsWith("__unmapped__:") || email.startsWith("__code_preview__:");
    const res = await fetch("/api/auth/admin/preview-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        codeOnly && code ? { code } : { email, code }
      ),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "ไม่สามารถเปิดมุมมองทดสอบได้");
      return;
    }
    router.push("/sales/orders");
  }

  if (sessionLoading) {
    return (
      <PageShell>
        <div className="flex min-h-screen items-center justify-center px-4">
          <p className="text-slate-600 dark:text-slate-400">กำลังโหลด...</p>
        </div>
      </PageShell>
    );
  }

  if (session?.role !== "admin") {
    return (
      <PageShell>
        <div className="flex min-h-screen items-center justify-center px-4">
          <p className="text-slate-600 dark:text-slate-400">เฉพาะ Admin เท่านั้น</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <AppHeader
        title="ศูนย์ควบคุม Admin"
        subtitle="ทดสอบมุมมอง VDA / เซลล์ และจัดการระบบ"
        role="admin"
      />

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <nav
          role="tablist"
          aria-label="เมนู Admin"
          className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-700 dark:bg-slate-800/60"
        >
          {ADMIN_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-4",
                activeTab === id
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
        {(adminPreview || salesPreview) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              กำลังดูในมุมมองทดสอบ
              {adminPreview && " · VDA/ร้านค้า"}
              {salesPreview && ` · เซลล์ ${salesPreview.asCode} (${salesPreview.asName})`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {adminPreview && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await fetch("/api/auth/admin/exit-preview", { method: "POST" });
                    window.location.reload();
                  }}
                >
                  ออกจากมุมมอง VDA
                </Button>
              )}
              {salesPreview && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await fetch("/api/auth/admin/exit-sales-preview", { method: "POST" });
                    window.location.reload();
                  }}
                >
                  ออกจากมุมมองเซลล์
                </Button>
              )}
            </div>
          </div>
        )}

        {activeTab === "vda" && (
          <Card className="vmi-card-elevated">
            <CardHeader className="pb-3">
              <CardDescription>
                เลือกคลัง VDA เพื่อดูสต็อกและสั่งสินค้าเหมือนผู้ใช้งานจริง
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerLoginForm
                adminPreview
                onSuccess={() => router.push("/stock")}
              />
            </CardContent>
          </Card>
        )}

        {activeTab === "sales" && (
          <Card className="vmi-card-elevated">
            <CardHeader className="pb-3">
              <CardDescription>
                เลือกเซลล์เพื่อดูออเดอร์ที่เขาเห็น (scope เดียวกับ login จริง)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {salesDirectoryError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  โหลดข้อมูลไม่สำเร็จ: {salesDirectoryError}
                </p>
              )}
              {salesDirectory && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1",
                      salesDirectory.loaded?.salesmanMaster
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    )}
                  >
                    cross_salesman:{" "}
                    {salesDirectory.loaded?.salesmanMaster ? "โหลดแล้ว" : "ยังไม่มี"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1",
                      salesDirectory.loaded?.vdaAosBill
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    )}
                  >
                    vda_aos_bill:{" "}
                    {salesDirectory.loaded?.vdaAosBill
                      ? "โหลดแล้ว"
                      : "ยังไม่มี — sync หรือตั้ง VDA_SALESMAN_MAP"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    มี VDA {salesDirectory.stats.peopleWithVda} คน ·{" "}
                    {salesDirectory.stats.withVdaAccess} รหัส
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-9"
                    placeholder="ค้นหารหัส / ชื่อ / อีเมล / VDA..."
                    value={repSearch}
                    onChange={(e) => setRepSearch(e.target.value)}
                  />
                </div>
                {salesDirectory && (
                  <div
                    role="group"
                    aria-label="กรองเซลล์"
                    className="flex shrink-0 rounded-xl border border-slate-200 p-1 dark:border-slate-700"
                  >
                    <button
                      type="button"
                      onClick={() => setRepScope("with_vda")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                        repScope === "with_vda"
                          ? "bg-violet-600 text-white shadow-sm dark:bg-violet-600"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}
                    >
                      มี VDA ({salesDirectory.stats.peopleWithVda})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepScope("all")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                        repScope === "all"
                          ? "bg-slate-700 text-white shadow-sm dark:bg-slate-600"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}
                    >
                      ทั้งหมด ({salesDirectory.stats.totalPeople})
                    </button>
                  </div>
                )}
              </div>
              <div className="vmi-scroll max-h-80 space-y-2 overflow-y-auto">
                {salesDirectoryLoading && (
                  <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด...</p>
                )}
                {!salesDirectoryLoading &&
                  filteredReps.map((rep) => {
                    const previewCodes =
                      rep.codes.filter((c) => c.vdas.length > 0).length > 0
                        ? rep.codes.filter((c) => c.vdas.length > 0)
                        : rep.codes;

                    return (
                      <div
                        key={rep.email}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {rep.name}
                          </p>
                          {rep.unmapped && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                              ไม่พบใน cross_salesman
                            </span>
                          )}
                          {rep.multipleCodes && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                              หลายรหัส ({rep.codes.length})
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {rep.unmapped
                            ? "ทดสอบด้วยรหัสเท่านั้น — ยังไม่มีอีเมลใน cross_salesman"
                            : rep.email}
                        </p>

                        {rep.multipleCodes ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              เลือกรหัสเพื่อดู VDA ที่รหัสนั้นดูแล
                            </p>
                            {previewCodes.map((c) => (
                              <button
                                key={c.code}
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 dark:hover:border-indigo-700"
                                onClick={() => void startSalesPreview(rep.email, c.code)}
                              >
                                <div>
                                  <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                                    {c.code}
                                  </span>
                                  {c.vdas.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {c.vdas.map((v) => (
                                        <span
                                          key={v}
                                          className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                                        >
                                          {v.toUpperCase()}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="mt-0.5 text-xs text-slate-400">
                                      ไม่มี VDA ใน vda_aos_bill
                                    </p>
                                  )}
                                </div>
                                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                            onClick={() =>
                              void startSalesPreview(
                                rep.email,
                                previewCodes[0]?.code
                              )
                            }
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-teal-700 dark:text-teal-400">
                                {previewCodes[0]?.code ?? "—"}
                              </span>
                              {rep.allVdas.map((v) => (
                                <span
                                  key={v}
                                  className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                                >
                                  {v.toUpperCase()}
                                </span>
                              ))}
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                {!salesDirectoryLoading && filteredReps.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {repScope === "with_vda" && !repSearch.trim()
                      ? salesDirectory?.loaded?.vdaAosBill
                        ? "ไม่พบเซลล์ที่จับคู่ได้ — ลองกด「ทั้งหมด」หรือ sync vda_aos_bill"
                        : "ยังไม่มี vda_aos_bill — รัน sync masters หรือตั้ง VDA_SALESMAN_MAP"
                      : "ไม่พบเซลล์"}
                  </p>
                )}
              </div>
              {repScope === "all" && !repSearch.trim() && salesDirectory && (
                <p className="text-center text-xs text-slate-400">
                  แสดง 50 คนแรก — ใช้ช่องค้นหาเพื่อหาเซลล์ที่ต้องการ
                </p>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push("/sales/orders")}
              >
                ดูออเดอร์ทั้งหมด (ไม่จำกัด scope)
              </Button>
            </CardContent>
          </Card>
        )}

        {activeTab === "settings" && (
          <div className="space-y-4">
            <AdminEmailsSection />

            <VdaSalesAccessPanel />

            <Card>
              <CardHeader>
                <CardTitle>อัปเดตข้อมูล Fabric</CardTitle>
                <CardDescription>
                  customer, salesman, promotion (C4), sku price, stock_cover_day
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FabricSyncStatus />
                <RefreshMastersButton />
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </PageShell>
  );
}
