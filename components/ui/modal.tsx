"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";

/**
 * โครงกล่อง modal ที่ใช้ร่วมกันทุกที่
 *
 * เดิมแต่ละ modal เขียนโครงเอง (`fixed inset-0 flex items-center` + กล่อง `p-5`)
 * แล้ว **ไม่มีใครกำหนดความสูงสูงสุด** — พอจอเตี้ย (มือถือแนวนอน, iPad แบ่งครึ่งจอ,
 * หรือคีย์บอร์ดเด้งขึ้นมาบัง) กล่องจะสูงเกินจอแล้วล้นทั้งบนและล่าง พื้นหลังเป็น
 * `fixed` เลยเลื่อนตามไม่ได้ → **ปุ่มยืนยัน/ยกเลิกที่อยู่ล่างสุดกดไม่ได้เลย**
 *
 * ตัวนี้บังคับให้ทุก modal: สูงไม่เกินจอ · เนื้อหาตรงกลางเลื่อนได้ · หัวกับท้ายอยู่กับที่
 * ใช้ dvh ไม่ใช่ vh เพราะบนมือถือ vh ไม่หดตามแถบเบราว์เซอร์/คีย์บอร์ด
 */
export function Modal({
  open,
  onClose,
  /** กันปิดตอนกำลังบันทึก — คลิกฉากหลังกับ Esc จะไม่ทำงาน */
  busy = false,
  size = "md",
  /** มือถือให้เด้งจากขอบล่างแบบ bottom sheet (เนื้อหายาว ๆ ใช้อันนี้) */
  sheetOnMobile = false,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  sheetOnMobile?: boolean;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  // ขังโฟกัสไว้ในกล่อง แล้วคืนให้ปุ่มเดิมตอนปิด (hooks/use-focus-trap.ts)
  useFocusTrap(panelRef, open);

  // ล็อกไม่ให้หน้าข้างหลังเลื่อนตอน modal เปิด — บนมือถือเดิมเลื่อนทะลุไปโดนหน้าหลัก
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex justify-center bg-black/40 p-3 sm:p-4",
        sheetOnMobile ? "items-end sm:items-center" : "items-center"
      )}
      onClick={() => !busy && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        // -1 เพื่อให้โฟกัสกล่องได้เองเมื่อยังไม่มีปุ่มไหนให้โฟกัส
        tabIndex={-1}
        className={cn(
          // max-h + flex-col คือหัวใจ: ลูกที่เป็น ModalBody จะได้ที่เหลือแล้วเลื่อนเอง
          "flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] dark:border-slate-700 dark:bg-slate-900",
          sheetOnMobile && "rounded-b-none sm:rounded-b-2xl",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-md",
          size === "lg" && "max-w-2xl",
          size === "xl" && "max-w-4xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/** หัวกล่อง — ไม่เลื่อน */
export function ModalHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("shrink-0 px-4 pt-4 sm:px-5 sm:pt-5", className)}>
      {children}
    </div>
  );
}

/** เนื้อหา — ได้พื้นที่ที่เหลือแล้วเลื่อนในตัวเอง */
export function ModalBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "vmi-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5",
        className
      )}
    >
      {children}
    </div>
  );
}

/** แถวปุ่ม — ไม่เลื่อน อยู่ล่างสุดเสมอ กดได้เสมอ */
export function ModalFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-800",
        className
      )}
    >
      {children}
    </div>
  );
}
