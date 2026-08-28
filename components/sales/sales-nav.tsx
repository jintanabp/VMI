"use client";

import { appPath, isPathUnder, normalizePathname } from "@/lib/paths";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardList, FileText, LayoutDashboard, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

/**
 * แถบสลับหน้า ฝั่งเซลล์: ภาพรวม / ออเดอร์ / PO / โปรโมชั่น / การแจ้งเตือน
 *
 * ป้ายแท็บใช้คำเดียวกับเนื้อหาข้างใน — เดิมแท็บเขียน "คำสั่งซื้อ" แต่ทุกข้อความ
 * ในหน้านั้นเรียก "ออเดอร์" ("ไม่มีออเดอร์ในสถานะนี้", "ลบออเดอร์นี้?")
 */
export function SalesNav() {
  // usePathname() คืนค่าพร้อม basePath และ / ปิดท้าย — ต้อง normalize ก่อนเทียบ
  // ไม่งั้นไม่มีแท็บไหนไฮไลต์เลย (ดู lib/paths.ts)
  const pathname = normalizePathname(usePathname());
  const { data } = useQuery<{ unseenCount: number }>({
    queryKey: ["sales-notifications"],
    queryFn: () => apiFetch(appPath("/api/sales/notifications")).then((r) => r.json()),
    refetchInterval: 60_000,
  });
  const unseen = data?.unseenCount ?? 0;

  // จำนวนออเดอร์รอตรวจ (badge บนแท็บคำสั่งซื้อ)
  // เดิมดึงลิสต์ออเดอร์ทั้งหมดพร้อม items มานับ .length ทุก 60 วิ ต่อแท็บที่เปิด
  // queryKey แยกจาก ["orders"] เพื่อไม่ให้ถูกล้างทุกครั้งที่หน้า invalidate ลิสต์
  const { data: counts } = useQuery<{ pending: number; priceFlagged: number }>({
    queryKey: ["sales-pending-count"],
    queryFn: async () => {
      const r = await apiFetch(appPath("/api/sales/pending-count"));
      if (!r.ok) return { pending: 0, priceFlagged: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
  });
  const pendingCount = counts?.pending ?? 0;
  const priceFlaggedCount = counts?.priceFlagged ?? 0;

  const tabs = [
    {
      href: "/sales",
      label: "ภาพรวม",
      icon: LayoutDashboard,
      // ไม่มี badge — ตัวเลขอยู่บนการ์ดในหน้านั้นอยู่แล้ว
      badge: 0,
      badgeTitle: "",
      warnBadge: 0,
      warnTitle: "",
    },
    {
      href: "/sales/orders",
      label: "ออเดอร์",
      icon: ClipboardList,
      badge: pendingCount,
      badgeTitle: `${pendingCount} ออเดอร์รอตรวจ`,
      warnBadge: priceFlaggedCount,
      warnTitle: `${priceFlaggedCount} ออเดอร์มีราคาไม่ตรงระบบ`,
    },
    {
      href: "/sales/po",
      label: "ใบสั่งซื้อ (PO)",
      icon: FileText,
      // ไม่มี badge โดยตั้งใจ — เคยโชว์จำนวน "PO ที่ออกวันนี้" เป็นจุดแดง
      // แต่มันไม่ใช่ตัวนับที่ยังไม่อ่าน กดเข้าไปดูก็ไม่หาย ค้างแดงทั้งวัน
      // จำนวน PO ดูได้จากการ์ดสรุปในหน้านั้นอยู่แล้ว
      badge: 0,
      badgeTitle: "",
      warnBadge: 0,
      warnTitle: "",
    },
    {
      href: "/sales/promotions",
      label: "โปรโมชั่น",
      icon: Tag,
      // ไม่มี badge — โปรเปลี่ยนเดือนละครั้ง ไม่ใช่ของที่ต้องเร่งดู
      badge: 0,
      badgeTitle: "",
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
    // บนจอ 390px แท็บทั้ง 5 กว้างรวม ~420px — เดิม nav เป็น flex เฉย ๆ ป้ายจึงถูกบีบ
    // จนตัดเป็น "ออ/เด/อร์" และแท็บสุดท้ายล้นออกนอกจอจนกดไม่ถึง
    // ให้เลื่อนแนวนอนในแถบตัวเองแทน (-mx/px กันเงา focus ถูกตัดขอบ)
    <nav
      className="vmi-scroll -mx-1 mb-2 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1"
      role="tablist"
    >
      {tabs.map((t) => {
        // "ภาพรวม" ที่ /sales เป็น prefix ของทุกแท็บ จึงต้องเทียบแบบตรงตัวเท่านั้น
        // ส่วนแท็บอื่นนับหน้าลูกด้วย (เผื่อมีหน้าย่อยในอนาคต)
        const active =
          t.href === "/sales"
            ? pathname === "/sales"
            : isPathUnder(pathname, t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
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
