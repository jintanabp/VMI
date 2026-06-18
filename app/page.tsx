import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  BarChart3,
  CheckCircle2,
  Package,
  ShieldCheck,
  Warehouse,
  UserCircle,
} from "lucide-react";
import { CUSTOMER_STORE_COOKIE } from "@/lib/auth/roles";
import { getRawSalesSession } from "@/lib/auth/sales-session";
import { PublicTopbar } from "@/components/layout/public-topbar";

export const dynamic = "force-dynamic";

const features = [
  { icon: BarChart3, label: "ดูสต็อก & CVD" },
  { icon: CheckCircle2, label: "แนะนำจำนวนสั่ง" },
  { icon: ShieldCheck, label: "เซลล์อนุมัติออเดอร์" },
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const storeId = cookieStore.get(CUSTOMER_STORE_COOKIE)?.value;
  const salesSession = await getRawSalesSession();

  if (storeId) redirect("/stock");
  if (salesSession?.role === "admin") redirect("/admin/dev");
  if (salesSession?.role === "sales") redirect("/sales/orders");
  return (
    <div className="relative min-h-screen overflow-hidden vmi-mesh-bg">
      <div className="vmi-hero-glow -left-32 top-20 h-72 w-72 bg-teal-400/30" />
      <div className="vmi-hero-glow -right-24 top-40 h-64 w-64 bg-cyan-500/20" />

      <PublicTopbar />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 pb-16 pt-24 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl vmi-gradient-brand text-white shadow-xl shadow-teal-900/25 ring-4 ring-white/50 dark:ring-slate-800/50">
          <Package className="h-10 w-10" />
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
          Vendor Managed Inventory
        </p>
        <h1 className="mt-3 bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-5xl font-bold tracking-tight text-transparent dark:from-white dark:to-slate-300 sm:text-6xl">
          VMI
        </h1>
        <p className="mt-4 max-w-lg text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          ระบบจัดการสต็อก แนะนำการสั่งสินค้า และอนุมัติคำสั่งซื้อ
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {features.map(({ icon: Icon, label }) => (
            <span key={label} className="vmi-feature-pill">
              <Icon className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              {label}
            </span>
          ))}
        </div>

        <div className="mt-12 grid w-full max-w-xl gap-4 sm:grid-cols-2">
          <Link href="/login?mode=customer" className="vmi-role-card vmi-role-card--primary group">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur transition-transform group-hover:scale-105">
              <Warehouse className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-bold">คลัง VDA</p>
              <p className="mt-1 text-sm font-normal text-teal-50/90">
                เลือก VDA · ดูสต็อก · สั่งสินค้า
              </p>
            </div>
          </Link>

          <Link
            href="/login?mode=sales"
            className="vmi-role-card group text-slate-800 dark:text-slate-100"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-transform group-hover:scale-105 dark:bg-slate-800 dark:text-slate-200">
              <UserCircle className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-bold">เซลล์ / Admin</p>
              <p className="mt-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                เข้าด้วย Microsoft Account
              </p>
            </div>
          </Link>
        </div>

        <p className="mt-14 text-sm text-slate-400 dark:text-slate-500">
          เลือกคลัง VDA เพื่อดูสต็อก · เซลล์ใช้บัญชีองค์กร
        </p>
      </div>
    </div>
  );
}
