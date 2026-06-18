"use client";

import { useState } from "react";
import { startMicrosoftLogin } from "@/lib/auth/microsoft-oauth-client";

export function SalesLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true);
    setError("");
    try {
      await startMicrosoftLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เริ่ม login ไม่สำเร็จ");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleLogin}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md active:scale-[0.99] disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-750"
      >
        <MicrosoftIcon />
        {loading ? "กำลังเข้าสู่ระบบ..." : "Sign in with Microsoft"}
      </button>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        ใช้บัญชี Microsoft ขององค์กร
      </p>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
