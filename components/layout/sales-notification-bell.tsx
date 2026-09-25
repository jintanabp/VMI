"use client";

import { appPath } from "@/lib/paths";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Ban, Bell, BellOff } from "lucide-react";
import { AnchoredPanel, PanelHeader } from "@/components/ui/anchored-panel";
import { useToast } from "@/components/ui/toast";
import { ORDER_KIND_META } from "@/lib/orders/sales-notify-display";
import { relativeTime } from "@/lib/orders/store-notify-display";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

interface OrderNoti {
  id: string;
  kind: string;
  title: string;
  detail: string;
  orderId: string | null;
  storeCode: string;
  storeName: string;
  createdAt: string;
  acknowledged: boolean;
  orderStatus?: string | null;
}

interface NotiResponse {
  orderItems: OrderNoti[];
  blockUnseenCount: number;
  orderUnseenCount: number;
  unseenCount: number;
}

const COLLAPSED = 8;

/**
 * กระดิ่งแจ้งเตือนของเซลล์ — มุมขวาบนทุกหน้า /sales แบบเดียวกับกระดิ่งร้าน (StoreNotificationBell)
 * แทนแท็บ "การแจ้งเตือน" เดิม ที่เซลล์ต้องกดเข้าไปเองถึงจะรู้ว่าร้านตอบรายการที่รอยืนยันแล้ว
 *
 * - กดเปิด = เห็นแล้ว → รับทราบแจ้งเตือนออเดอร์ให้ทั้งหมด (เหมือนหน้าเต็มที่รับทราบเมื่อเปิดดู)
 * - "หยุดสั่ง" ต้องกดรับทราบเองทีละรายการ จึงไม่รับทราบให้ — บอกจำนวนแล้วลิงก์ไปหน้าเต็ม
 * - กดแจ้งเตือน = เปิดใบออเดอร์นั้นในหน้าตรวจสอบ
 * - แจ้งเตือนใหม่ระหว่างที่เปิดหน้าอยู่เด้งเป็น toast (รอบแรกไม่เด้งย้อนหลัง)
 *
 * queryKey เดียวกับหน้า /sales/notifications — รับทราบที่ไหนเลขตรงกันทุกที่
 */
export function SalesNotificationBell() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /** id ที่เคยเห็นแล้ว — null = ยังไม่เคยโหลดสำเร็จ (รอบแรกตั้งหลักเฉย ๆ ไม่เด้ง) */
  const seen = useRef<Set<string> | null>(null);
  /** ยังไม่อ่าน ณ ตอนกดเปิด — กันรายการซีดต่อหน้าต่อตาหลังรับทราบสำเร็จ */
  const highlighted = useRef<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery<NotiResponse>({
    queryKey: ["sales-notifications"],
    queryFn: async () => {
      const r = await apiFetch(appPath("/api/sales/notifications"));
      if (!r.ok) throw new Error(`โหลดแจ้งเตือนไม่สำเร็จ (${r.status})`);
      return r.json();
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const items = data?.orderItems ?? [];
  const orderUnseen = data?.orderUnseenCount ?? 0;
  const blockUnseen = data?.blockUnseenCount ?? 0;
  const unread = data?.unseenCount ?? 0;

  useEffect(() => {
    if (!data) return;
    if (seen.current == null) {
      seen.current = new Set(data.orderItems.map((n) => n.id));
      return;
    }
    const fresh = data.orderItems.filter((n) => !seen.current!.has(n.id));
    for (const n of [...fresh].reverse()) {
      seen.current.add(n.id);
      toast({
        key: n.id,
        title: `${n.storeCode.toUpperCase()} · ${n.title}`,
        detail: n.detail || undefined,
        tone: n.kind.endsWith("rejected") || n.kind === "order_cancelled" ? "warn" : "info",
      });
    }
  }, [data, toast]);

  const markRead = useMutation({
    mutationFn: async () => {
      await apiFetch(appPath("/api/sales/notifications"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "order" }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales-notifications"] });
    },
  });

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
    for (const n of items) if (!n.acknowledged) highlighted.current.add(n.id);
    setOpen(true);
    if (orderUnseen > 0 && !markRead.isPending) markRead.mutate();
  }

  function openOrder(n: OrderNoti) {
    if (!n.orderId || !n.orderStatus) return;
    close();
    router.push(
      `/sales/orders?order=${encodeURIComponent(n.orderId)}&status=${encodeURIComponent(n.orderStatus)}`
    );
  }

  // ใหม่สุดก่อน (API เรียงที่ยังไม่รับทราบก่อน — ในกระดิ่งเรียงตามเวลาอ่านง่ายกว่า)
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED);

  return (
    <>
      <div ref={anchorRef} className="relative shrink-0">
        <button
          type="button"
          onClick={toggleOpen}
          aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการใหม่` : "การแจ้งเตือน"}
          aria-expanded={open}
          className={cn(
            "relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
            open && "bg-slate-100 text-slate-800 dark:bg-slate-800"
          )}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>

      <AnchoredPanel
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        width={380}
        reflowKey={`${visible.length}-${showAll}-${blockUnseen}`}
      >
        <PanelHeader title="การแจ้งเตือน" onClose={close} />

        {blockUnseen > 0 && (
          <Link
            href="/sales/notifications"
            onClick={close}
            className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-slate-800 dark:bg-amber-950/30 dark:text-amber-300"
          >
            <Ban className="h-3.5 w-3.5" />
            ร้านแจ้งหยุดสั่ง {blockUnseen} รายการ รอรับทราบ →
          </Link>
        )}

        {isLoading && items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-400">กำลังโหลด…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <BellOff className="h-6 w-6 text-slate-300 dark:text-slate-600" />
            {isError ? (
              <>
                <p className="text-xs text-red-600 dark:text-red-400">โหลดการแจ้งเตือนไม่สำเร็จ</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="rounded bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700"
                >
                  ลองใหม่
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-400">ยังไม่มีการแจ้งเตือน</p>
            )}
          </div>
        ) : (
          <ul className="vmi-scroll min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {visible.map((n) => {
              const meta = ORDER_KIND_META[n.kind] ?? ORDER_KIND_META.order_created;
              const Icon = meta.icon;
              const isNew = highlighted.current.has(n.id);
              const clickable = !!n.orderId && !!n.orderStatus;
              return (
                <li
                  key={n.id}
                  {...(clickable
                    ? {
                        role: "button",
                        tabIndex: 0,
                        title: "เปิดออเดอร์นี้",
                        onClick: () => openOrder(n),
                        onKeyDown: (e: KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openOrder(n);
                          }
                        },
                      }
                    : {})}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2.5",
                    isNew && "bg-teal-50/60 dark:bg-teal-950/20",
                    clickable &&
                      "cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/40"
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.className)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-1.5 text-[11px]">
                      <span className={cn("font-semibold", meta.className)}>{meta.label}</span>
                      <span className="font-mono text-slate-400">{n.storeCode.toUpperCase()}</span>
                    </p>
                    <p
                      className={cn(
                        "text-[13px] font-semibold",
                        isNew ? "text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
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
                      <p className="mt-0.5 text-xs break-words text-slate-500 dark:text-slate-400">
                        {n.detail}
                      </p>
                    )}
                    {n.orderId && !n.orderStatus && (
                      <p className="mt-0.5 text-[11px] text-slate-400">ออเดอร์นี้ถูกลบไปแล้ว</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(n.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
          {sorted.length > COLLAPSED ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="font-medium text-slate-500 hover:text-slate-700"
            >
              {showAll ? "ย่อ" : `แสดงทั้งหมด ${sorted.length} รายการ`}
            </button>
          ) : (
            <span />
          )}
          <Link
            href="/sales/notifications"
            onClick={close}
            className="font-medium text-teal-700 hover:underline dark:text-teal-400"
          >
            ดูหน้ารวม + หยุดสั่ง →
          </Link>
        </div>
      </AnchoredPanel>
    </>
  );
}
