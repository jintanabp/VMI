"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toast แบบเบา ๆ ไม่พึ่ง dependency ภายนอก
 *
 * มีไว้ให้แจ้งเตือนจากพนักงาน "เด้งให้เห็นทันที" ได้ทุกหน้า
 * เดิมร้านต้องเข้าหน้าประวัติเองถึงจะรู้ว่าออเดอร์ถูกอนุมัติ/แก้/ลบ
 */
export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastInput {
  /** ใส่เพื่อกันเด้งซ้ำตัวเดิม (เช่น id ของ notification) */
  key?: string;
  title: string;
  detail?: string;
  tone?: ToastTone;
  /** มิลลิวินาที — 0 = ไม่ปิดเอง */
  duration?: number;
}

interface ToastRow extends ToastInput {
  id: number;
}

const TONE: Record<
  ToastTone,
  { icon: typeof Bell; className: string; iconClass: string }
> = {
  info: {
    icon: Bell,
    className:
      "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
    iconClass: "text-teal-600 dark:text-teal-400",
  },
  success: {
    icon: Check,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-100",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    icon: AlertTriangle,
    className:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  error: {
    icon: Info,
    className:
      "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100",
    iconClass: "text-red-600 dark:text-red-400",
  },
};

const DEFAULT_DURATION = 8_000;
/** เก็บบนจอพร้อมกันได้เท่านี้ — เกินนี้ตัวเก่าสุดหลุดออก */
const MAX_VISIBLE = 4;

const ToastContext = createContext<{ toast: (t: ToastInput) => void } | null>(
  null
);

export function useToast() {
  const ctx = useContext(ToastContext);
  // ไม่ throw — หน้าไหนที่ยังไม่ได้ครอบ Provider ก็ยังเรนเดอร์ได้ แค่ไม่มี toast
  return ctx ?? { toast: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<ToastRow[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(1);
  /** key ที่เคยเด้งไปแล้ว — กันเด้งซ้ำเมื่อ poll เจอรายการเดิม */
  const seenKeys = useRef(new Set<string>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      if (input.key) {
        if (seenKeys.current.has(input.key)) return;
        seenKeys.current.add(input.key);
      }
      const id = nextId.current++;
      setRows((prev) => [...prev, { ...input, id }].slice(-MAX_VISIBLE));
      const duration = input.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        rows.length > 0 &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80"
            role="status"
            aria-live="polite"
          >
            {rows.map((r) => {
              const tone = TONE[r.tone ?? "info"];
              const Icon = tone.icon;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "pointer-events-auto flex w-full items-start gap-2 rounded-xl border p-3 shadow-lg",
                    tone.className
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone.iconClass)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{r.title}</p>
                    {r.detail && (
                      <p className="mt-0.5 break-words text-xs opacity-80">
                        {r.detail}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(r.id)}
                    className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
                    aria-label="ปิด"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
