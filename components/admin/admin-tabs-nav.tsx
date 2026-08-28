"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Database, Eye, Shield, Store, Tag } from "lucide-react";
import {
  ADMIN_GROUPS,
  matchAdminNav,
  type AdminBadgeKey,
  type AdminGroupDef,
  type AdminIconKey,
} from "@/lib/admin/admin-nav";
import { appPath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

/**
 * แท็บหมวดหลักของหน้าแอดมิน
 *
 * แท็บเป็น route จริง ไม่ใช่ useState — เดิมเปลี่ยนแท็บแล้ว URL ไม่เปลี่ยน ทำให้ลิงก์ไป
 * หน้าใดหน้าหนึ่งไม่ได้ และรีเฟรชแล้วเด้งกลับแท็บแรกทุกครั้ง
 *
 * โครงเมนูอยู่ที่ lib/admin/admin-nav.ts (เป็น .ts ล้วนเพื่อให้เทสต์ได้) ไฟล์นี้ทำแค่
 * แปลง iconKey เป็น component แล้ววาด
 */

const ICONS: Record<AdminIconKey, typeof Database> = {
  database: Database,
  store: Store,
  tag: Tag,
  eye: Eye,
  shield: Shield,
};

export interface AdminBadges {
  storePending: number;
  syncFailed: boolean;
  promoReady?: boolean;
}

/** แปลง response ของ /api/admin/badges เป็นค่าต่อ badge key ที่เมนูประกาศไว้ */
export function badgeState(
  badges: AdminBadges | null,
  key: AdminBadgeKey | undefined
): { count: number; warn: boolean } {
  if (!badges || !key) return { count: 0, warn: false };
  switch (key) {
    case "storePending":
      return { count: badges.storePending ?? 0, warn: false };
    case "syncFailed":
      return { count: 0, warn: Boolean(badges.syncFailed) };
    case "promoNotReady":
      return { count: 0, warn: badges.promoReady === false };
  }
}

function groupBadge(group: AdminGroupDef, badges: AdminBadges | null) {
  let count = 0;
  let warn = false;
  for (const sub of group.subTabs) {
    const s = badgeState(badges, sub.badge);
    count += s.count;
    warn = warn || s.warn;
  }
  return { count, warn };
}

export function AdminTabsNav() {
  const pathname = usePathname();
  const [badges, setBadges] = useState<AdminBadges | null>(null);
  const active = matchAdminNav(pathname)?.group.key ?? null;

  useEffect(() => {
    // endpoint เดียวสำหรับตัวเลขบนแท็บ — เดิมทุกแท็บยิง /api/admin/store-accounts
    // เองคนละครั้งเพื่อเลขตัวเดียว
    apiFetch(appPath("/api/admin/badges"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBadges(d))
      .catch(() => {});
  }, []);

  return (
    // ชื่อไทยยาว ๆ — เดิมเป็นแถวเดียว overflow-x-auto ทำให้บนมือถือ/iPad แท็บท้าย ๆ
    // โดนตัดครึ่งและไม่มีอะไรบอกว่าเลื่อนได้ ใช้ grid แทนจะเห็นครบทุกอัน
    <nav
      aria-label="เมนู Admin"
      className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 sm:grid-cols-3 lg:flex dark:border-slate-700 dark:bg-slate-800/60"
    >
      {ADMIN_GROUPS.map((group) => {
        const Icon = ICONS[group.iconKey];
        const isActive = active === group.key;
        const { count, warn } = groupBadge(group, badges);
        return (
          <Link
            key={group.key}
            href={group.subTabs[0].href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              // lg:flex-1 = แท็บกางเต็มความกว้างแถบ ไม่กองอยู่ซ้ายแล้วเหลือที่ว่างยาว ๆ
              "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors sm:gap-2 sm:px-3 lg:flex-1",
              isActive
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{group.label}</span>
            {count > 0 && (
              <span
                className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white"
                title={`${count} รายการรอดำเนินการ`}
              >
                {count}
              </span>
            )}
            {warn && (
              <span
                className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500"
                title="มีบางอย่างในหมวดนี้ต้องดู"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
