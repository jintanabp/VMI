"use client";

import { appPath } from "@/lib/paths";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { AnchoredPanel, PanelHeader } from "@/components/ui/anchored-panel";
import { useToast } from "@/components/ui/toast";
import {
  NOTIF_META,
  notifTone,
  relativeTime,
} from "@/lib/orders/store-notify-display";
import type { StoreNotificationRow } from "@/lib/orders/store-notify";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

/** จำนวนที่โชว์ก่อนกดกาง */
const COLLAPSED = 6;

/**
 * กระดิ่งแจ้งเตือนของร้านค้า — มีทุกหน้าที่ใช้ AppHeader
 *
 * เดิมกล่องนี้เป็น <section> ปักค้างบนสุดของหน้า /history ตลอดไป เพราะเงื่อนไข
 * แสดงผลคือ "มีแจ้งเตือนกี่รายการ" ไม่ใช่ "ยังไม่อ่านกี่รายการ" — ร้านรับรู้แล้ว
 * แต่มันก็ยังอยู่ ไม่มี action ไหนเคลียร์มันได้ (บั๊กแบบเดียวกับจุดแดงบนแท็บ PO
 * ฝั่งเซลล์ที่ถอดออกไปแล้ว) ย้ายมาเป็นแผงลอยแทน: กดเปิด = อ่าน, ปิดแล้วหาย,
 * ของเก่ายังย้อนดูได้
 */
export function StoreNotificationBell() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  /** เวลาของแจ้งเตือนล่าสุดที่เคยเห็น — null = ยังไม่เคย poll สำเร็จสักรอบ */
  const lastSeenAt = useRef<string | null>(null);
  /**
   * id ที่ "ยังไม่อ่าน ณ ตอนกดเปิด" — พอ PATCH สำเร็จข้อมูลจะกลายเป็นอ่านแล้วหมด
   * ถ้าดูจาก readAt ตรง ๆ รายการจะซีดเป็นเทาต่อหน้าต่อตาระหว่างที่ยังอ่านอยู่
   */
  const highlighted = useRef<Set<string>>(new Set());

  const { data: countData } = useQuery<{
    unread: number;
    fresh?: StoreNotificationRow[];
  }>({
    queryKey: ["store-notifications-count"],
    queryFn: async () => {
      const since = lastSeenAt.current;
      const url = appPath(
        `/api/store/notifications?count=1${since ? `&since=${encodeURIComponent(since)}` : ""}`
      );
      const r = await apiFetch(url);
      if (!r.ok) return { unread: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const unread = countData?.unread ?? 0;

  // รายการเต็มดึงเฉพาะตอนกางแผง — ปิดอยู่ก็ไม่ต้องโหลด
  const { data: listData, isLoading } = useQuery<{
    items: StoreNotificationRow[];
    unread: number;
  }>({
    queryKey: ["store-notifications"],
    queryFn: async () => {
      const res = await apiFetch(appPath("/api/store/notifications"), {
        cache: "no-store",
      });
      if (!res.ok) return { items: [], unread: 0 };
      return res.json();
    },
    enabled: open,
    // เปิดแผงค้างไว้แล้วมีของใหม่เข้ามา ต้องเห็นในลิสต์ด้วย ไม่ใช่ขึ้นแค่เลขบนกระดิ่ง
    refetchInterval: open ? 60_000 : false,
  });
  const items = listData?.items ?? [];

  const markRead = useMutation({
    mutationFn: async () => {
      await apiFetch(appPath("/api/store/notifications"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      // สองคีย์นี้ต้องไปด้วยกันเสมอ — ไม่งั้นเลขบนกระดิ่งค้างทั้งที่อ่านไปแล้ว
      void queryClient.invalidateQueries({ queryKey: ["store-notifications"] });
      void queryClient.invalidateQueries({
        queryKey: ["store-notifications-count"],
      });
    },
  });

  // รอบแรกไม่เด้ง (จะเด้งย้อนหลังทั้งกอง) — แค่ตั้งหลักเวลาไว้ แล้วเด้งเฉพาะของที่มาทีหลัง
  useEffect(() => {
    if (!countData) return;
    if (lastSeenAt.current == null) {
      lastSeenAt.current = new Date().toISOString();
      return;
    }
    const fresh = countData.fresh ?? [];
    if (fresh.length === 0) return;
    // เรียงเก่า → ใหม่ ให้ toast ตัวล่าสุดอยู่ล่างสุด
    for (const n of [...fresh].reverse()) {
      toast({
        key: n.id,
        title: n.title,
        detail: n.detail || undefined,
        tone: notifTone(n.kind),
      });
    }
    lastSeenAt.current = fresh.reduce(
      (max, n) => (n.createdAt > max ? n.createdAt : max),
      lastSeenAt.current
    );
  }, [countData, toast]);

  const close = useCallback(() => {
    setOpen(false);
    setShowAll(false);
    highlighted.current.clear();
  }, []);

  function toggleOpen() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    // กดเปิด = ได้เห็นแล้ว จึงเคลียร์เลขแดงทันที ไม่ต้องมีปุ่ม "อ่านทั้งหมด" ให้กดซ้ำ
    if (unread > 0 && !markRead.isPending) markRead.mutate();
  }

  // สะสมตอนเรนเดอร์ ไม่ใช่ใน effect — ต้องรู้ผลทันในรอบเดียวกับที่ map ข้างล่างใช้
  // (ถ้าไปเซ็ตใน effect ref เปลี่ยนแล้วไม่ re-render รายการจะขึ้นเทาหมดตั้งแต่แรก)
  // idempotent อยู่แล้ว รันซ้ำใน StrictMode ก็ได้ผลเท่าเดิม
  if (open) {
    for (const n of items) {
      if (!n.readAt) highlighted.current.add(n.id);
    }
  }

  const visible = showAll ? items : items.slice(0, COLLAPSED);

  return (
    <>
      <div ref={anchorRef} className="relative shrink-0">
        <button
          type="button"
          onClick={toggleOpen}
          aria-label={
            unread > 0 ? `การแจ้งเตือน ${unread} รายการใหม่` : "การแจ้งเตือน"
          }
          aria-expanded={open}
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
            open && "bg-slate-100 text-slate-800 dark:bg-slate-800"
          )}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>

      <AnchoredPanel
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        width={360}
        reflowKey={`${items.length}-${showAll}`}
      >
        <PanelHeader title="การแจ้งเตือน" onClose={close} />

        {isLoading && items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">
            กำลังโหลด…
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <BellOff className="h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-400">ยังไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          <ul className="vmi-scroll min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {visible.map((n) => {
              const meta = NOTIF_META[n.kind] ?? {
                label: n.kind,
                className:
                  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
              };
              const isNew = highlighted.current.has(n.id);
              return (
                <li
                  key={n.id}
                  className={cn(
                    "flex flex-wrap items-start gap-x-2 gap-y-1 px-3 py-2.5",
                    isNew && "bg-teal-50/60 dark:bg-teal-950/20"
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold",
                      meta.className,
                      !isNew && "opacity-70"
                    )}
                  >
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[13px] font-semibold",
                        isNew
                          ? "text-slate-800 dark:text-slate-100"
                          : "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {isNew && (
                        <span
                          className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle"
                          aria-label="ยังไม่อ่าน"
                        />
                      )}
                      {n.title}
                    </p>
                    {n.detail && (
                      <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">
                        {n.detail}
                      </p>
                    )}
                    {n.poNumbers.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {n.poNumbers.map((po) => (
                          <span
                            key={po}
                            className={cn(
                              "rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
                              !isNew && "opacity-70"
                            )}
                          >
                            {po}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {relativeTime(n.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {items.length > COLLAPSED && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="shrink-0 border-t border-slate-100 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
          >
            {showAll ? "ย่อ" : `ดูทั้งหมด ${items.length} รายการ`}
          </button>
        )}
      </AnchoredPanel>
    </>
  );
}
