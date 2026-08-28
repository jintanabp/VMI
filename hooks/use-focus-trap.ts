"use client";

import { useEffect, type RefObject } from "react";

/** element ที่โฟกัสได้และมองเห็นอยู่จริง (ข้ามตัวที่ disabled/ซ่อน) */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * กองซ้อนของกล่องที่เปิดอยู่ — ทำงานเฉพาะใบบนสุด
 *
 * ถ้ามี modal ซ้อน modal (เช่นกล่องยืนยันเปิดทับกล่องรายละเอียด) ทั้งสองใบจะมี
 * listener อยู่พร้อมกัน ถ้าไม่กันไว้ ใบล่างจะแย่งโฟกัสกลับไปเรื่อย ๆ
 */
const trapStack: HTMLElement[] = [];

/**
 * ขังโฟกัสไว้ในกล่อง แล้วคืนให้ปุ่มเดิมตอนปิด
 *
 * เดิมโค้ดนี้อยู่ใน components/ui/modal.tsx ตัวเดียว แต่ modal ที่เขียน portal เอง
 * (โปร C4, แผงรายละเอียด PO) ไม่ได้ใช้ Modal จึงไม่มีกับดักโฟกัสเลย — กด Tab แล้ว
 * โฟกัสหลุดไปโดนปุ่มของแถวสินค้าที่อยู่หลังฉากทันที ผู้ใช้คีย์บอร์ดกับ screen reader
 * จึงหลงว่าตัวเองอยู่ตรงไหน
 *
 * ดัก keydown ที่ document ระดับ capture ไม่ใช่ที่ตัวกล่อง เพราะ listener ที่ตัวกล่อง
 * จะไม่ทำงานเลยเมื่อโฟกัสอยู่ "นอก" กล่อง ซึ่งเป็นเคสที่ต้องกู้กลับมากที่สุด
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // โฟกัสตัวแรกในกล่อง — ถ้ายังไม่มีอะไรให้โฟกัส (เนื้อหากำลังโหลด) ให้โฟกัสกล่องเอง
    const first = focusableIn(panel)[0];
    (first ?? panel).focus();

    trapStack.push(panel);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (trapStack[trapStack.length - 1] !== panel) return;

      const items = focusableIn(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const current = document.activeElement as HTMLElement | null;

      // โฟกัสหลุดออกนอกกล่องไปแล้ว (เนื้อหาที่โฟกัสอยู่หายไปตอนโหลดเสร็จ
      // หรือผู้ใช้คลิกฉากหลัง) — ดึงกลับเข้ากล่อง
      if (!current || !panel.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? lastEl : firstEl).focus();
        return;
      }
      if (e.shiftKey && (current === firstEl || current === panel)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && current === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const at = trapStack.lastIndexOf(panel);
      if (at !== -1) trapStack.splice(at, 1);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}
