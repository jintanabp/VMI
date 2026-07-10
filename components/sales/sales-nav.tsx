"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

/** แถบสลับหน้า ฝั่งเซลล์: คำสั่งซื้อ / การแจ้งเตือน (พร้อม badge จำนวนที่ยังไม่อ่าน) */
export function SalesNav() {
  const pathname = usePathname();
  const { data } = useQuery<{ unseenCount: number }>({
    queryKey: ["sales-notifications"],
    queryFn: () => fetch("/api/sales/notifications").then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const unseen = data?.unseenCount ?? 0;

  const tabs = [
    { href: "/sales/orders", label: "คำสั่งซื้อ", icon: ClipboardList, badge: 0 },
    { href: "/sales/notifications", label: "การแจ้งเตือน", icon: Bell, badge: unseen },
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
                className={cn(
                  "inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4",
                  active ? "bg-white text-teal-700" : "bg-red-500 text-white"
                )}
              >
                {t.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
