"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LogOut, Package, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { useSalesSession } from "@/hooks/use-sales-session";
import { useAdminPreview } from "@/hooks/use-admin-preview";
import { useSalesPreview } from "@/hooks/use-sales-preview";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  storeCode?: string;
  storeName?: string;
  storeAddress?: string;
  isVda?: boolean;
  role?: "customer" | "sales" | "supervisor" | "manager" | "admin";
  actions?: React.ReactNode;
  /** หัวเพจกะทัดรัด — ใช้กับหน้าตารางยาว */
  compact?: boolean;
  /** ปุ่มกลับชัดเจน (เช่น กลับ hub ย่อยของ admin) */
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  storeCode,
  storeName,
  storeAddress,
  isVda = false,
  role,
  actions,
  compact = false,
  backHref,
  backLabel,
  onBack,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { session } = useSalesSession();
  const adminPreview = useAdminPreview();
  const salesPreview = useSalesPreview();

  const isCustomerRoute =
    pathname.startsWith("/stock") || pathname.startsWith("/order");
  const isAdminHub = pathname.startsWith("/admin");
  const showCustomerNav = role === "customer";
  const showSalesNav =
    (role === "sales" || role === "admin") && !isCustomerRoute;

  const showPreviewBanner = adminPreview || salesPreview;

  async function exitToAdminHub() {
    if (salesPreview) {
      await fetch("/api/auth/admin/exit-sales-preview", { method: "POST" });
    } else if (adminPreview) {
      await fetch("/api/auth/admin/exit-preview", { method: "POST" });
    }
    window.location.href = "/admin/dev";
  }

  type BackNav =
    | { kind: "link"; href: string; label: string }
    | { kind: "action"; label: string; onClick: () => void };

  function resolveBackNav(): BackNav | null {
    if (showPreviewBanner) return null;

    if (onBack) {
      return { kind: "action", label: backLabel ?? "กลับ", onClick: onBack };
    }
    if (backHref) {
      return { kind: "link", href: backHref, label: backLabel ?? "กลับ" };
    }
    if (showPreviewBanner) {
      return {
        kind: "action",
        label: "กลับศูนย์ Admin",
        onClick: () => void exitToAdminHub(),
      };
    }
    if (session?.role === "admin" && !isAdminHub) {
      return {
        kind: "link",
        href: "/admin/dev",
        label: "กลับศูนย์ Admin",
      };
    }
    if (pathname.startsWith("/order")) {
      return { kind: "link", href: "/stock", label: "กลับหน้าสต็อก" };
    }
    if (pathname.startsWith("/login")) {
      return { kind: "link", href: "/", label: "กลับหน้าแรก" };
    }
    return null;
  }

  const backNav = resolveBackNav();

  const roleLabel =
    role === "customer"
      ? isVda
        ? "VDA"
        : "ร้านค้า"
      : role === "sales"
        ? "เซลล์"
        : role === "supervisor"
          ? "Supervisor"
          : role === "manager"
            ? "Manager"
            : role === "admin"
              ? "Admin"
              : null;

  const toolbar = (
    <div className="flex w-full flex-wrap items-center gap-1.5 sm:gap-2 md:w-auto md:flex-nowrap md:justify-end">
      <ThemeToggle />
      {actions}
      {showCustomerNav && (
        <div className="hidden gap-1 md:flex">
          <NavLink href="/stock" active={pathname === "/stock"}>
            สต็อก
          </NavLink>
          <NavLink href="/order" active={pathname === "/order"}>
            สั่งสินค้า
          </NavLink>
        </div>
      )}
      {showSalesNav && (
        <>
          <NavLink href="/sales/orders" active={pathname.startsWith("/sales")}>
            ออเดอร์
          </NavLink>
          {role === "admin" && !pathname.startsWith("/admin") && (
            <NavLink href="/admin/dev" active={pathname.startsWith("/admin")}>
              ทดสอบ
            </NavLink>
          )}
        </>
      )}
      {(session || role === "customer") && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0 text-slate-500 md:ml-0 dark:text-slate-400"
          onClick={() => {
            if (role === "customer" && session?.role === "admin") {
              void exitToAdminHub();
              return;
            }
            if (role === "customer") {
              fetch("/api/auth/customer/logout", { method: "POST" }).then(
                () => {
                  window.location.href = "/";
                }
              );
            } else {
              fetch("/api/auth/msal/session", { method: "DELETE" }).then(
                () => {
                  window.location.href = "/";
                }
              );
            }
          }}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">
            {role === "customer" && session?.role === "admin"
              ? "ออกจาก VDA"
              : "ออกจากระบบ"}
          </span>
        </Button>
      )}
    </div>
  );

  return (
    <>
      {showPreviewBanner && (
        <div className="border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/40 sm:px-4">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium text-amber-900 dark:text-amber-200">
              โหมดทดสอบ Admin
              {adminPreview && " · มุมมอง VDA"}
              {salesPreview &&
                ` · มุมมองเซลล์ ${salesPreview.asCode} (${salesPreview.asName})`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-amber-300 bg-white text-amber-900 hover:bg-amber-100 sm:w-auto dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              onClick={() => void exitToAdminHub()}
            >
              <ArrowLeft className="h-4 w-4" />
              กลับศูนย์ Admin
            </Button>
          </div>
        </div>
      )}
      <header
        className={cn(
          "sticky top-0 z-40 vmi-glass border-b border-slate-200/60 dark:border-slate-700/60",
          compact && "vmi-header-compact"
        )}
      >
        <div
          className={cn(
            "mx-auto w-full min-w-0 max-w-7xl px-3 sm:px-4",
            compact ? "py-2" : "py-3 sm:py-4"
          )}
        >
          {backNav && (
            <div className="mb-2.5 flex">
              {backNav.kind === "link" ? (
                <Link
                  href={backNav.href}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  {backNav.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={backNav.onClick}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  {backNav.label}
                </button>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between md:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-4">
              <Link
                href={session?.role === "admin" ? "/admin/dev" : "/"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl vmi-gradient-brand text-white shadow-md sm:h-11 sm:w-11"
              >
                <Package className="h-5 w-5" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className="font-bold text-teal-700 dark:text-teal-400">
                    VMI
                  </span>
                  {roleLabel && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {roleLabel}
                    </span>
                  )}
                  {session?.salesmanCode && role !== "customer" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400">
                      <User className="h-3 w-3" />
                      {session.salesmanCode}
                    </span>
                  )}
                </div>
                <h1
                  className={cn(
                    "font-bold leading-snug tracking-tight text-slate-900 dark:text-slate-50",
                    compact
                      ? "text-sm sm:text-base"
                      : "text-base sm:text-xl xl:text-2xl"
                  )}
                >
                  {title}
                </h1>
                {subtitle && !compact && (
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {subtitle}
                  </p>
                )}
                {storeCode && !compact && (
                  <div className="mt-1 space-y-0.5">
                    <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                      {isVda ? (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          คลัง {storeCode.toUpperCase()}
                        </span>
                      ) : (
                        <>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {storeCode}
                          </span>
                          {storeName ? ` · ${storeName}` : ""}
                        </>
                      )}
                    </p>
                    {storeAddress && !isVda && (
                      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 md:max-w-md lg:max-w-xl xl:max-w-2xl">
                        {storeAddress}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 pt-2.5 dark:border-slate-800 max-md:w-full md:border-0 md:pt-1">
              {toolbar}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-all sm:px-4",
        active
          ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
          : "text-slate-600 hover:bg-white hover:shadow-sm dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      {children}
    </Link>
  );
}
