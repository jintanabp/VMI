"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { matchAdminNav } from "@/lib/admin/admin-nav";
import { appPath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { badgeState, type AdminBadges } from "./admin-tabs-nav";

/**
 * แท็บย่อยภายในหมวด
 *
 * ตัวเลข/จุดเตือนโชว์ทั้งที่หมวด (รวมยอด) และที่แท็บย่อย (ของตัวเอง) — เข้ามาในหมวดแล้ว
 * ต้องรู้ต่อได้ว่าหน้าไหนที่ต้องดู ไม่ใช่เห็นแค่ว่า "หมวดนี้มีอะไรสักอย่าง"
 */
export function AdminSubTabs() {
  const pathname = usePathname();
  const [badges, setBadges] = useState<AdminBadges | null>(null);
  const match = matchAdminNav(pathname);

  useEffect(() => {
    fetch(appPath("/api/admin/badges"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBadges(d))
      .catch(() => {});
  }, []);

  // หมวดที่มีแท็บย่อยอันเดียว ไม่ต้องมีแถบ — chip ที่ active ตลอดเวลาไม่ได้บอกอะไร
  if (!match || match.group.subTabs.length < 2) return null;

  return (
    <nav
      aria-label={`เมนูย่อย ${match.group.label}`}
      className="flex flex-wrap gap-1 px-0.5"
    >
      {match.group.subTabs.map((sub) => {
        const isActive = match.sub?.href === sub.href;
        const { count, warn } = badgeState(badges, sub.badge);
        return (
          <Link
            key={sub.href}
            href={sub.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              isActive
                ? "bg-teal-600 text-white shadow-sm dark:bg-teal-500"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            )}
          >
            <span className="truncate">{sub.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                  isActive ? "bg-white text-teal-700" : "bg-red-500 text-white"
                )}
                title={`${count} รายการรอดำเนินการ`}
              >
                {count}
              </span>
            )}
            {warn && (
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  isActive ? "bg-white" : "bg-red-500"
                )}
                title="หน้านี้มีบางอย่างต้องดู"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
