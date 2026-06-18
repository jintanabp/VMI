import { Suspense } from "react";
import MicrosoftCallbackClient from "@/components/auth/microsoft-callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-slate-500">
          กำลังเข้าสู่ระบบ...
        </div>
      }
    >
      <MicrosoftCallbackClient />
    </Suspense>
  );
}
