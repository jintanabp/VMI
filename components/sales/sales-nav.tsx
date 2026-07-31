"use client";

import { appPath } from "@/lib/paths";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardList, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/** แถบสลับหน้า ฝั่งเซลล์: คำสั่งซื้อ / การแจ้งเตือน (พร้อม badge จำนวนที่ยังไม่อ่าน) */
export function SalesNav() {
  const pathname = usePathname();
  const { data } = useQuery<{ unseenCount: number }>({
    queryKey: ["sales-notifications"],
    queryFn: () => fetch(appPath("/api/sales/notifications")).then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const unseen = data?.unseenCount ?? 0;

  // จำนวนออเดอร์รอตรวจ (badge บนแท็บคำสั่งซื้อ)
  // เดิมดึงลิสต์ออเดอร์ทั้งหมดพร้อม items มานับ .length ทุก 60 วิ ต่อแท็บที่เปิด
  // queryKey แยกจาก ["orders"] เพื่อไม่ให้ถูกล้างทุกครั้งที่หน้า invalidate ลิสต์
  const { data: counts } = useQuery<{ pending: number; priceFlagged: number }>({
    queryKey: ["sales-pending-count"],
    queryFn: async () => {
      const r = await fetch(appPath("/api/sales/pending-count"));
      if (!r.ok) return { pending: 0, priceFlagged: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
  });
  const pendingCount = counts?.pending ?? 0;
  const priceFlaggedCount = counts?.priceFlagged ?? 0;

  // PO ที่ออกวันนี้ — เดิม badge แท็บนี้ hardcode 0 ไว้เฉย ๆ
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: poToday } = useQuery<{ total: number }>({
    queryKey: ["sales-po-today", todayIso],
    queryFn: async () => {
      const r = await fetch(
        appPath(
          `/api/sales/purchase-orders?dateFrom=${todayIso}&dateTo=${todayIso}&pageSize=1`
        )
      );
      if (!r.ok) return { total: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
  });
  const poTodayCount = poToday?.total ?? 0;

  const tabs = [
    {
      href: "/sales/orders",
      label: "คำสั่งซื้อ",
      icon: ClipboardList,
      badge: pendingCount,
      badgeTitle: `${pendingCount} ออเดอร์รอตรวจ`,
      warnBadge: priceFlaggedCount,
      warnTitle: `${priceFlaggedCount} ออเดอร์มีราคาที่ร้านแก้เอง`,
    },
    {
      href: "/sales/po",
      label: "ใบสั่งซื้อ (PO)",
      icon: FileText,
      badge: poTodayCount,
      badgeTitle: `${poTodayCount} PO ที่ออกวันนี้`,
      warnBadge: 0,
      warnTitle: "",
    },
    {
      href: "/sales/notifications",
      label: "การแจ้งเตือน",
      icon: Bell,
      badge: unseen,
      badgeTitle: `${unseen} การแจ้งเตือนที่ยังไม่รับทราบ`,
      warnBadge: 0,
      warnTitle: "",
    },
  ];

  return (
    <nav className="mb-2 flex shrink-0 gap-1.5" role="tablist">
      {tabs.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              active
                ? "bg-teal-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
            {t.badge > 0 && (
              <span
                title={t.badgeTitle}
                className={cn(
                  "inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4",
                  active ? "bg-white text-teal-700" : "bg-red-500 text-white"
                )}
              >
                {t.badge}
              </span>
            )}
            {t.warnBadge > 0 && (
              <span
                title={t.warnTitle}
                className={cn(
                  "inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4",
                  active ? "bg-white text-amber-700" : "bg-amber-500 text-white"
                )}
              >
                ⚠{t.warnBadge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
