"use client";

import { useEffect, useState } from "react";

/**
 * หน่วงค่าไว้จนกว่าจะหยุดเปลี่ยนครบตามเวลาที่กำหนด
 *
 * ใช้กับค่าที่เอาไปเป็น queryKey แล้วเปลี่ยนถี่ตามการพิมพ์/กดปุ่ม — ถ้าไม่หน่วง
 * react-query จะถือว่าเป็นคิวรีใหม่ทุกครั้ง (`isLoading` ไม่ใช่ `isFetching`)
 * ทำให้ทั้งตารางกะพริบเป็นสถานะกำลังโหลดทุกครั้งที่กดหนึ่งที
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
