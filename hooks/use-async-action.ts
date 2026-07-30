"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncAction<A extends unknown[]> {
  /** ยิงแบบ fire-and-forget — ใส่ใน onClick ได้ตรง ๆ ไม่ต้อง void/async */
  run: (...args: A) => void;
  pending: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * ห่อ handler ที่ await งาน async ให้มี pending/error และไม่มีทางค้าง
 *
 * เหตุผลที่ต้องมี: ปุ่มที่เขียนเป็น `onClick={async () => { await fetch(...) }}`
 * เมื่อ fetch reject จะไม่มีอะไรรีเซ็ตสถานะ ผู้ใช้เห็นเป็น "กดแล้วไม่มีอะไรเกิดขึ้น"
 *
 * `runningRef` กันกดซ้ำได้แน่นอนกว่า `disabled` เพราะการคลิกรัว ๆ
 * เกิดก่อน React commit สถานะ disabled ได้
 */
export function useAsyncAction<A extends unknown[]>(
  fn: (...args: A) => Promise<void>,
  options?: { onError?: (message: string) => void }
): AsyncAction<A> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const fnRef = useRef(fn);
  const onErrorRef = useRef(options?.onError);

  fnRef.current = fn;
  onErrorRef.current = options?.onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback((...args: A) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPending(true);
    setError(null);

    void (async () => {
      try {
        await fnRef.current(...args);
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "ดำเนินการไม่สำเร็จ — ลองใหม่อีกครั้ง";
        // ไม่ setState หลัง unmount (หลาย handler พาไปหน้าอื่นตอนสำเร็จ)
        if (mountedRef.current) setError(message);
        onErrorRef.current?.(message);
      } finally {
        runningRef.current = false;
        if (mountedRef.current) setPending(false);
      }
    })();
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
