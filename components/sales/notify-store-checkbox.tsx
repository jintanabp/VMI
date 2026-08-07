"use client";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * ตัวเลือกในกล่องยืนยันลบ — จะเขียนแจ้งเตือนใบใหม่ให้ร้านรู้ว่าถูกลบหรือไม่
 *
 * การลบจะเคลียร์แจ้งเตือนเก่าของออเดอร์นั้นออกให้เสมอ ตัวเลือกนี้คุมแค่ใบใหม่:
 * ลบทีละใบระหว่างทำงานปกติควรแจ้ง (ร้านกำลังรอของอยู่) แต่ตอนล้างประวัติ
 * ก่อนส่งให้ผู้ใช้ทดสอบ การแจ้งจะกลายเป็นขยะค้างในกล่องแจ้งเตือนของร้าน
 */
export function NotifyStoreCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-800/60">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
        aria-label="แจ้งให้ร้านทราบว่าถูกลบ"
      />
      <span className="text-slate-600 dark:text-slate-300">
        แจ้งให้ร้านทราบว่าถูกลบ
        <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
          ไม่ติ๊ก = ลบเงียบ ๆ ไม่มีแจ้งเตือนใหม่ค้างในหน้าร้าน (ใช้ตอนล้างประวัติ)
        </span>
      </span>
    </label>
  );
}
