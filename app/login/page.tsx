import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserCircle, Package, Warehouse } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCustomerStoreFromCookie } from "@/lib/auth/customer-session";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { CustomerLoginForm } from "@/components/auth/customer-login-form";
import { SalesLoginButton } from "@/components/auth/sales-login-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode;
  const authError = params.error
    ? decodeURIComponent(params.error)
    : undefined;
  const salesSession = await getRawSalesSession();
  const customerStore = await getCustomerStoreFromCookie();

  if (mode === "sales" && salesSession?.role === "sales") {
    redirect("/sales/orders");
  }
  if (mode === "sales" && salesSession?.role === "admin") {
    redirect("/admin/dev");
  }
  if (mode === "customer" && customerStore && !salesSession) {
    redirect("/stock");
  }

  if (!mode || mode === "choose") {
    redirect("/");
  }

  if (mode !== "customer" && mode !== "sales") {
    redirect("/");
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div className="absolute inset-0 vmi-gradient-brand opacity-95" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-teal-300/20 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-teal-100">VMI Platform</p>
              <p className="text-xl font-bold">Vendor Managed Inventory</p>
            </div>
          </div>
        </div>
        <div className="relative z-10 space-y-4 text-white">
          <h2 className="text-3xl font-bold leading-tight">
            {mode === "customer" ? (
              <>
                คลัง VDA
                <br />
                ดูสต็อกและสั่งสินค้า
              </>
            ) : (
              <>
                เซลล์ / Admin
                <br />
                อนุมัติคำสั่งซื้อ
              </>
            )}
          </h2>
          <p className="max-w-sm text-teal-50/90">
            {mode === "customer"
              ? "เลือกคลัง VDA แล้วเข้าดูสต็อกและส่งคำสั่งซื้อ"
              : "เข้าด้วยบัญชี Microsoft ของบริษัท"}
          </p>
        </div>
        <p className="relative z-10 text-xs text-teal-100/70">
          © VMI · Vendor Managed Inventory
        </p>
      </aside>

      <main className="flex min-h-svh flex-col vmi-mesh-bg">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 flex-col justify-center px-6 pb-12 lg:px-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl vmi-gradient-brand text-white shadow-lg">
                {mode === "customer" ? (
                  <Warehouse className="h-6 w-6" />
                ) : (
                  <UserCircle className="h-6 w-6" />
                )}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {mode === "customer" ? "เข้าสู่ระบบ VDA" : "เข้าสู่ระบบเซลล์"}
              </h1>
              <p className="text-slate-500 dark:text-slate-400">
                Vendor Managed Inventory
              </p>
            </div>

            {mode === "customer" && (
              <Card className="vmi-card-elevated">
                <CardHeader>
                  <CardTitle>เลือกคลัง VDA</CardTitle>
                  <CardDescription>
                    เลือก VDA ที่ต้องการดูสต็อกและสั่งสินค้า
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CustomerLoginForm adminPreview={salesSession?.role === "admin"} />
                  {salesSession?.role === "admin" && (
                    <Link
                      href="/admin/dev"
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 transition-colors hover:text-teal-900 dark:text-teal-400 dark:hover:text-teal-300"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      กลับหน้าทดสอบ
                    </Link>
                  )}
                  {!salesSession && (
                    <Link
                      href="/"
                      className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      กลับหน้าแรก
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}

            {mode === "sales" && (
              <Card className="vmi-card-elevated">
                <CardHeader>
                  <CardTitle>เข้าสู่ระบบเซลล์</CardTitle>
                  <CardDescription>
                    ใช้บัญชี Microsoft ของบริษัท
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {authError && (
                    <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                      {authError}
                    </p>
                  )}
                  <SalesLoginButton />
                  <Link
                    href="/"
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-400"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    กลับหน้าแรก
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
