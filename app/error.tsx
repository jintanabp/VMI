"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[VMI] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center vmi-mesh-bg">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        เกิดข้อผิดพลาด
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        ระบบทำงานผิดพลาดชั่วคราว ลองใหม่อีกครั้ง — ถ้ายังไม่หาย
        กรุณาแจ้งผู้ดูแลระบบพร้อมรหัสอ้างอิงด้านล่าง
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-slate-400 dark:text-slate-500">
          {error.digest}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
        >
          <RotateCcw className="h-4 w-4" />
          ลองใหม่
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Home className="h-4 w-4" />
          กลับหน้าแรก
        </Link>
      </div>
    </div>
  );
}
