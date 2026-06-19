"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  RefreshCw,
  Search,
  Shield,
  UserCircle,
  Users,
  Warehouse,
} from "lucide-react";
import { useSalesSession } from "@/hooks/use-sales-session";
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

interface PersonCodeAssignment {
  code: string;
  vdas: string[];
}

interface SalesPreviewPerson {
  email: string;
  name: string;
  codes: PersonCodeAssignment[];
  allVdas: string[];
  multipleCodes: boolean;
  hasVdaAccess: boolean;
}

interface SalesPreviewDirectory {
  people: SalesPreviewPerson[];
  peopleWithVda?: SalesPreviewPerson[];
  stats: {
    totalPeople: number;
    peopleWithVda: number;
    withVdaAccess: number;
  };
}

type SalesPreviewScope = "with_vda" | "all";

function filterPreviewPeople(rows: SalesPreviewPerson[], query: string) {
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
  const { session } = useSalesSession();
  const adminPreview = useAdminPreview();
  const salesPreview = useSalesPreview();
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<"hub" | "vda" | "sales" | "settings">("hub");
  const [salesDirectory, setSalesDirectory] = useState<SalesPreviewDirectory | null>(null);
  const [salesDirectoryLoading, setSalesDirectoryLoading] = useState(false);
  const [repSearch, setRepSearch] = useState("");
  const [repScope, setRepScope] = useState<SalesPreviewScope>("with_vda");

  useEffect(() => {
    if (session?.role !== "admin") return;
    setSalesDirectoryLoading(true);
    fetch("/api/admin/vda-sales")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSalesDirectory(data))
      .catch(() => setSalesDirectory(null))
      .finally(() => setSalesDirectoryLoading(false));
  }, [session]);

  const peopleWithVda = useMemo(() => {
    if (!salesDirectory) return [];
    if (Array.isArray(salesDirectory.peopleWithVda)) return salesDirectory.peopleWithVda;
    return salesDirectory.people.filter((p) => p.hasVdaAccess);
  }, [salesDirectory]);

  const filteredReps = useMemo(() => {
    const base =
      repScope === "with_vda" ? peopleWithVda : (salesDirectory?.people ?? []);
    const filtered = filterPreviewPeople(base, repSearch);
    if (repScope === "all" && !repSearch.trim()) return filtered.slice(0, 50);
    return filtered;
  }, [salesDirectory, repSearch, repScope, peopleWithVda]);

  async function startSalesPreview(email: string, code?: string) {
    await fetch("/api/auth/admin/preview-sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    router.push("/sales/orders");
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
        subtitle={
          activePanel === "hub"
            ? "สลับมุมมอง VDA · เซลล์ · ตั้งค่าระบบ"
            : activePanel === "vda"
              ? "มุมมอง VDA / ร้านค้า"
              : activePanel === "sales"
                ? "มุมมองเซลล์"
                : "ตั้งค่าระบบ"
        }
        role="admin"
        onBack={activePanel !== "hub" ? () => setActivePanel("hub") : undefined}
        backLabel="กลับศูนย์ Admin"
      />

      <main className="mx-auto max-w-5xl space-y-6 px-3 py-4 sm:px-4 sm:py-6">
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

        {activePanel === "hub" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setActivePanel("vda")}
                className="vmi-perspective-card group text-left"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md">
                  <Warehouse className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  มุมมอง VDA
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  เลือกคลัง ดูสต็อก สั่งสินค้า พร้อมโปร C4
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 dark:text-teal-400">
                  เข้าดู <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePanel("sales")}
                className="vmi-perspective-card group text-left"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  มุมมองเซลล์
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  ดูออเดอร์ในมุมมองเซลล์แต่ละคน
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 dark:text-indigo-400">
                  เลือกเซลล์ <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActivePanel("settings")}
                className="vmi-perspective-card group text-left"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-700 text-white shadow-md">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  ตั้งค่าระบบ
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  เซลล์↔VDA, ดึงข้อมูล Fabric, จัดการ admin
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  จัดการ <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Eye className="h-5 w-5 text-teal-600" />
                  ทางลัด
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => router.push("/sales/orders")}>
                  ออเดอร์ทั้งหมด (Admin)
                </Button>
                <Button variant="outline" onClick={() => setActivePanel("vda")}>
                  เลือก VDA
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {activePanel === "vda" && (
          <Card className="vmi-card-elevated">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Warehouse className="h-5 w-5 text-teal-600" />
                    มุมมอง VDA
                  </CardTitle>
                  <CardDescription className="mt-1">
                    เลือกคลัง VDA เพื่อดูสต็อกและสั่งสินค้าเหมือนผู้ใช้งานจริง
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActivePanel("hub")}>
                  กลับ
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <CustomerLoginForm
                adminPreview
                onSuccess={() => router.push("/stock")}
              />
            </CardContent>
          </Card>
        )}

        {activePanel === "sales" && (
          <Card className="vmi-card-elevated">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-indigo-600" />
                    มุมมองเซลล์
                  </CardTitle>
                  <CardDescription className="mt-1">
                    เลือกเซลล์เพื่อดูออเดอร์ที่เขาเห็น (scope เดียวกับ login จริง)
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setActivePanel("hub")}>
                  กลับ
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {salesDirectory && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  มี VDA {salesDirectory.stats.peopleWithVda} คน ·{" "}
                  {salesDirectory.stats.withVdaAccess} รหัส — แสดงเฉพาะคนที่ดูแล VDA ก่อน
                </p>
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
                          {rep.multipleCodes && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                              หลายรหัส ({rep.codes.length})
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{rep.email}</p>

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
                      ? "ยังไม่มีเซลล์ที่ผูก VDA ใน vda_aos_bill"
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

        {activePanel === "settings" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">ตั้งค่าระบบ</h2>
              <Button variant="ghost" size="sm" onClick={() => setActivePanel("hub")}>
                กลับ
              </Button>
            </div>

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
