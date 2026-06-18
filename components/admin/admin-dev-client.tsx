"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bug,
  Eye,
  RefreshCw,
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

interface SalesRepOption {
  id: string;
  email: string;
  code: string;
  name: string;
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
        `สำเร็จ — customer: ${data.customer ? "OK" : "-"}, salesman: ${data.salesman ? "OK" : "-"}, promo: ${data.promotion ? "OK" : "-"}, sku: ${data.skuMaster ? "OK" : "-"}, stock: ${data.stockCover ? "OK" : "-"}`
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
  const [salesReps, setSalesReps] = useState<SalesRepOption[]>([]);
  const [repSearch, setRepSearch] = useState("");
  const [accessCodes, setAccessCodes] = useState<{ code: string }[]>([]);
  const [newCode, setNewCode] = useState("");

  useEffect(() => {
    if (session?.role !== "admin") return;
    fetch("/api/admin/salesmen")
      .then((r) => r.json())
      .then((data) => setSalesReps(Array.isArray(data) ? data : []))
      .catch(() => setSalesReps([]));
    fetch("/api/admin/access-codes")
      .then((r) => r.json())
      .then((data) => setAccessCodes(Array.isArray(data) ? data : []))
      .catch(() => setAccessCodes([]));
  }, [session]);

  const filteredReps = useMemo(() => {
    const q = repSearch.toLowerCase();
    return salesReps
      .filter(
        (r) =>
          !q ||
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [salesReps, repSearch]);

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
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 dark:border-amber-800/50 dark:from-amber-950/40 dark:to-orange-950/30">
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
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md">
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
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
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
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-md">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  ตั้งค่าระบบ
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Allowlist, ดึงข้อมูล Fabric, debug
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
              <Input
                placeholder="ค้นหารหัส / ชื่อ / อีเมลเซลล์..."
                value={repSearch}
                onChange={(e) => setRepSearch(e.target.value)}
              />
              <div className="vmi-scroll max-h-80 space-y-2 overflow-y-auto">
                {filteredReps.map((rep) => (
                  <button
                    key={rep.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                    onClick={async () => {
                      await fetch("/api/auth/admin/preview-sales", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: rep.email }),
                      });
                      router.push("/sales/orders");
                    }}
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {rep.code} · {rep.name}
                      </p>
                      <p className="text-xs text-slate-500">{rep.email}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </button>
                ))}
                {filteredReps.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">ไม่พบเซลล์</p>
                )}
              </div>
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">สิทธิ์เข้าใช้งาน (Allowlist)</CardTitle>
                <CardDescription>รหัสพนักงานที่อนุญาตให้ login เซลล์</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="flex-1"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="เพิ่มรหัส เช่น S091"
                  />
                  <Button
                    onClick={async () => {
                      const code = newCode.trim().toUpperCase();
                      if (!code) return;
                      await fetch("/api/admin/access-codes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code }),
                      });
                      setNewCode("");
                      const list = await fetch("/api/admin/access-codes").then((r) =>
                        r.json()
                      );
                      setAccessCodes(Array.isArray(list) ? list : []);
                    }}
                  >
                    เพิ่ม
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {accessCodes.map((c) => (
                    <span
                      key={c.code}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
                    >
                      {c.code}
                      <button
                        type="button"
                        className="text-xs text-slate-500 hover:text-red-600"
                        onClick={async () => {
                          await fetch(
                            `/api/admin/access-codes?code=${encodeURIComponent(c.code)}`,
                            { method: "DELETE" }
                          );
                          const list = await fetch("/api/admin/access-codes").then((r) =>
                            r.json()
                          );
                          setAccessCodes(Array.isArray(list) ? list : []);
                        }}
                      >
                        ลบ
                      </button>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>อัปเดตข้อมูล Fabric</CardTitle>
                <CardDescription>
                  customer, salesman, promotion (C4), sku price, stock_cover_day
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RefreshMastersButton />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  Debug
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-48 overflow-auto rounded-xl bg-slate-100 p-4 text-xs dark:bg-slate-900">
                  {JSON.stringify(session, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </PageShell>
  );
}
