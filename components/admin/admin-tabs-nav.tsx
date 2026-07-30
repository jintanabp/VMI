"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Database,
  Shield,
  SlidersHorizontal,
  Store,
  Users,
  Warehouse,
} from "lucide-react";
import { appPath } from "@/lib/paths";
import { cn } from "@/lib/utils";

export interface AdminTabDef {
  href: string;
  label: string;
  icon: typeof Warehouse;
}

/**
 * แท็บเป็น route จริง ไม่ใช่ useState — เดิมเปลี่ยนแท็บแล้ว URL ไม่เปลี่ยน
 * ทำให้ลิงก์ไปหน้าใดหน้าหนึ่งไม่ได้ และรีเฟรชแล้วเด้งกลับแท็บแรกทุกครั้ง
 */
export const ADMIN_TABS: AdminTabDef[] = [
  { href: "/admin/sync", label: "ข้อมูล & Sync", icon: Database },
  { href: "/admin/stores", label: "บัญชีร้านค้า", icon: Store },
  { href: "/admin/thresholds", label: "MIN/MAX & หยุดสั่ง", icon: SlidersHorizontal },
  { href: "/admin/vda", label: "มุมมอง VDA", icon: Warehouse },
  { href: "/admin/sales", label: "มุมมองเซลล์", icon: Users },
  { href: "/admin/settings", label: "ตั้งค่าระบบ", icon: Shield },
];

interface AdminBadges {
  storePending: number;
  syncFailed: boolean;
}

export function AdminTabsNav() {
  const pathname = usePathname();
  const [badges, setBadges] = useState<AdminBadges | null>(null);

  useEffect(() => {
    // endpoint เดียวสำหรับตัวเลขบนแท็บ — เดิมทุกแท็บยิง /api/admin/store-accounts
    // เองคนละครั้งเพื่อเลขตัวเดียว
    fetch(appPath("/api/admin/badges"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBadges(d))
      .catch(() => {});
  }, []);

  return (
    <nav
      aria-label="เมนู Admin"
      className="vmi-scroll flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-700 dark:bg-slate-800/60"
    >
      {ADMIN_TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href) ?? false;
        const count = href === "/admin/stores" ? badges?.storePending ?? 0 : 0;
        const warn = href === "/admin/sync" && badges?.syncFailed;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-4",
              active
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
            {count > 0 && (
              <span
                className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white"
                title={`${count} คำขอรอดำเนินการ`}
              >
                {count}
              </span>
            )}
            {warn && (
              <span
                className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500"
                title="รอบ sync ล่าสุดมีชุดข้อมูลที่ล้มเหลว"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
