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
  /** ขยายความกว้างสูงสุดของเนื้อหา — ใช้กับหน้าตารางกว้าง (stock/order) */
  wide?: boolean;
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
  wide = false,
  backHref,
  backLabel,
  onBack,
}: AppHeaderProps) {
  const contentMaxWidth = wide ? "max-w-[96rem]" : "max-w-7xl";
  const pathname = usePathname();
  const { session } = useSalesSession();
  const adminPreview = useAdminPreview();
  const salesPreview = useSalesPreview();

  const isCustomerRoute =
    pathname.startsWith("/stock") ||
    pathname.startsWith("/order") ||
    pathname.startsWith("/manage");
  const isAdminHub = pathname.startsWith("/admin");

  const customerCompactHeader = compact && isCustomerRoute;
  const salesCompactHeader = compact && !isCustomerRoute;

  const showPreviewBanner = adminPreview || salesPreview;

  async function exitToAdminHub() {
    if (salesPreview) {
      await fetch("/api/auth/admin/exit-sales-preview", { method: "POST" });
    } else if (adminPreview) {
      await fetch("/api/auth/admin/exit-preview", { method: "POST" });
    }
    window.location.href = "/admin";
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
        href: "/admin",
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
      {role === "customer" && (
        <nav className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          <Link
            href="/stock"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              pathname.startsWith("/stock") || pathname.startsWith("/order")
                ? "bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            )}
          >
            สินค้า
          </Link>
          <Link
            href="/manage"
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              pathname.startsWith("/manage")
                ? "bg-white text-teal-700 shadow-sm dark:bg-slate-900 dark:text-teal-400"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            )}
          >
            จัดการ
          </Link>
        </nav>
      )}
      <ThemeToggle />
      {actions}
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
          <div className={cn("mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", contentMaxWidth)}>
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
            "mx-auto w-full min-w-0 px-3 sm:px-4",
            contentMaxWidth,
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
          <div
            className={cn(
              "flex gap-2",
              customerCompactHeader
                ? "flex-row items-center justify-between"
                : salesCompactHeader
                  ? "flex-row items-center justify-between"
                  : "flex-col gap-2.5 md:flex-row md:items-start md:justify-between md:gap-4"
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
              <Link
                href={session?.role === "admin" ? "/admin" : "/"}
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-xl vmi-gradient-brand text-white shadow-md",
                  customerCompactHeader || salesCompactHeader
                    ? "h-9 w-9"
                    : "h-10 w-10 sm:h-11 sm:w-11"
                )}
              >
                <Package className="h-5 w-5" />
              </Link>
              <div className="min-w-0 flex-1">
                {!customerCompactHeader && !salesCompactHeader && (
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
                )}
                <h1
                  className={cn(
                    "font-bold leading-snug tracking-tight text-slate-900 dark:text-slate-50",
                    compact
                      ? "text-xs xl:text-sm"
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

            <div
              className={cn(
                "shrink-0",
                customerCompactHeader || salesCompactHeader
                  ? ""
                  : "border-t border-slate-100 pt-2.5 dark:border-slate-800 max-md:w-full md:border-0 md:pt-1"
              )}
            >
              {toolbar}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
