"use client";

import { appPath } from "@/lib/paths";
import { useEffect } from "react";

/** path เก่า — ส่งต่อไป /auth/callback */
export default function LegacyMicrosoftCallbackPage() {
  useEffect(() => {
    window.location.replace(
      `${appPath("/auth/callback")}${window.location.search}${window.location.hash}`
    );
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      กำลังเข้าสู่ระบบ...
    </div>
  );
}
