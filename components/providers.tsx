"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { UnauthorizedError } from "@/lib/api-fetch";
import { appPath } from "@/lib/paths";

/**
 * session หมดกลางทาง = เด้งไป /login แทนที่จะค้าง spinner หรือขึ้น error วนไม่จบ
 *
 * เด้งครั้งเดียว: query หลายตัวจะ 401 พร้อมกันตอน session หมด · flag กันไม่ให้ยิง
 * navigation ซ้ำ และไม่เด้งถ้าอยู่หน้า login อยู่แล้ว (กันวนลูป)
 */
let redirecting = false;

function handleAuthError(error: unknown) {
  if (!(error instanceof UnauthorizedError)) return;
  if (typeof window === "undefined") return;
  if (redirecting) return;
  if (window.location.pathname.includes("/login")) return;
  redirecting = true;
  // /login ต้องมี mode ไม่งั้นเด้งออกไปหน้าแรก — เดาจาก path ปัจจุบัน
  const mode = window.location.pathname.includes("/sales") ? "sales" : "customer";
  window.location.href = appPath(`/login?mode=${mode}&reason=session`);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleAuthError }),
        mutationCache: new MutationCache({ onError: handleAuthError }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // session หมด = 401 ทุกครั้ง retry ไปก็ 401 ซ้ำ ให้เด้ง login เลย
            retry: (count, error) =>
              error instanceof UnauthorizedError ? false : count < 1,
          },
        },
      })
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
