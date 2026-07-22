"use client";

import { appPath } from "@/lib/paths";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { completeMicrosoftLogin } from "@/lib/auth/microsoft-oauth-client";

export default function MicrosoftCallbackClient() {
  const searchParams = useSearchParams();
  const startedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const azureError =
      searchParams.get("error_description") ?? searchParams.get("error");
    if (azureError) {
      setError(decodeURIComponent(azureError));
      return;
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setError("ไม่พบข้อมูลจาก Microsoft — กรุณา Sign in ใหม่");
      return;
    }

    completeMicrosoftLogin(code, state).catch((err) => {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    });
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center vmi-mesh-bg px-4">
      <div className="vmi-card max-w-md p-8 text-center">
        {error ? (
          <>
            <p className="text-sm font-medium text-red-600">{error}</p>
            <a
              href={appPath("/login?mode=sales")}
              className="mt-6 inline-block text-sm font-semibold text-teal-700 hover:underline"
            >
              ลอง Sign in ใหม่
            </a>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            <p className="text-slate-600">กำลังเข้าสู่ระบบ...</p>
          </div>
        )}
      </div>
    </div>
  );
}
