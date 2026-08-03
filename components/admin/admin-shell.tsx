"use client";

import type { ReactNode } from "react";
import { appPath } from "@/lib/paths";
import { useAdminPreview } from "@/hooks/use-admin-preview";
import { useSalesPreview } from "@/hooks/use-sales-preview";
import { useAsyncAction } from "@/hooks/use-async-action";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { AdminTabsNav } from "./admin-tabs-nav";

/**
 * โครงหน้าแอดมิน — header + แท็บ + แถบแจ้งโหมดทดสอบ
 * การตรวจสิทธิ์อยู่ที่ app/admin/layout.tsx ฝั่งเซิร์ฟเวอร์แล้ว
 * ไม่ต้องเช็ค role ซ้ำใน client (เดิมเช็คสองชั้นและ flash "กำลังโหลด..." ทุกครั้ง)
 */
export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const adminPreview = useAdminPreview();
  const salesPreview = useSalesPreview();

  /** ออกจากโหมดทดสอบ — ล้าง cookie เป็น best-effort แล้ว reload เสมอ */
  const exitPreviewAction = useAsyncAction(async (path: string) => {
    try {
      await fetch(appPath(path), { method: "POST" });
    } finally {
      window.location.reload();
    }
  });

  return (
    <PageShell>
      <AppHeader
        title="ศูนย์ควบคุม Admin"
        subtitle="จัดการข้อมูล บัญชี และทดสอบมุมมองผู้ใช้"
        role="admin"
      />

      {/* max-w ต้องตรงกับ AppHeader (max-w-7xl) ไม่งั้นขอบซ้าย/ขวาของหัวเพจ
          กับเนื้อหาไม่ตรงกัน และเนื้อหาดูลอย ๆ ไม่เต็มจอบนจอกว้าง */}
      <main className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <AdminTabsNav />

        {(adminPreview || salesPreview) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              กำลังดูในมุมมองทดสอบ
              {adminPreview && " · VDA/ร้านค้า"}
              {salesPreview &&
                ` · เซลล์ ${salesPreview.asCode} (${salesPreview.asName})`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {adminPreview && (
                <Button
                  size="sm"
                  variant="outline"
                  pending={exitPreviewAction.pending}
                  onClick={() =>
                    exitPreviewAction.run("/api/auth/admin/exit-preview")
                  }
                >
                  ออกจากมุมมอง VDA
                </Button>
              )}
              {salesPreview && (
                <Button
                  size="sm"
                  variant="outline"
                  pending={exitPreviewAction.pending}
                  onClick={() =>
                    exitPreviewAction.run("/api/auth/admin/exit-sales-preview")
                  }
                >
                  ออกจากมุมมองเซลล์
                </Button>
              )}
            </div>
          </div>
        )}

        <header className="px-1">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}
        </header>

        {children}
      </main>
    </PageShell>
  );
}
