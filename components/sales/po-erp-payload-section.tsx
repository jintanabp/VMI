"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { appPath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import {
  erpReasonLabel,
  type ErpOrderPayload,
  type ErpReadiness,
  type ErpPayloadContext,
} from "@/lib/po/erp-payload";

/**
 * ส่วน "payload ที่จะส่งเข้า ERP" ในแผงรายละเอียด PO — **อ่านอย่างเดียว**
 *
 * ยังไม่มีปุ่มส่ง และยังไม่มีโค้ดที่ยิงออกเน็ตในโปรเจกต์นี้เลย: ปลายทางจริง
 * (`insertOCROrderToBill`) ล็อกคู่ orderNo+customerCode ไว้ 6 เดือนเมื่อส่งซ้ำ
 * ⇒ ต้องรอทีม ERP ยืนยัน deliveryDate และรอ UAT ก่อนถึงจะต่อขาส่ง (เฟส 2)
 *
 * ระหว่างนี้จอนี้ทำหน้าที่: ให้เห็นตัวเลขจริงที่จะไปถึงปลายทาง และบอกว่าใบนี้
 * ยังขาดอะไรบ้างพร้อมทางแก้
 */

interface ErpPreview {
  payload: ErpOrderPayload;
  readiness: ErpReadiness;
  context: ErpPayloadContext;
}

export function PoErpPayloadSection({ poNumber }: { poNumber: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // โหลดเฉพาะเมื่อกางแผง — คนส่วนใหญ่เปิด PO มาดูรายการสินค้า ไม่ได้มาดู payload
  const { data, isLoading, isError, refetch } = useQuery<ErpPreview>({
    queryKey: ["po-erp-payload", poNumber],
    enabled: open,
    queryFn: async () => {
      const res = await apiFetch(
        appPath(
          `/api/sales/purchase-orders/${encodeURIComponent(poNumber)}?format=erp`
        )
      );
      if (!res.ok) throw new Error(`โหลด payload ไม่สำเร็จ (${res.status})`);
      return res.json();
    },
  });

  const json = data ? JSON.stringify(data.payload, null, 2) : "";

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // คลิปบอร์ดถูกปิด (http หรือ webview) — ยังเลือกข้อความในกล่องเองได้
    }
  }

  return (
    <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-bold text-slate-800 dark:text-slate-100"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        ข้อมูลที่จะส่งเข้า ERP
        <span className="ml-auto shrink-0 rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          ดูอย่างเดียว · ยังไม่ส่ง
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 px-3 py-2.5 dark:border-slate-700">
          {isLoading && (
            <p className="py-3 text-center text-xs text-slate-500">กำลังประกอบข้อมูล...</p>
          )}

          {isError && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              ประกอบข้อมูลไม่สำเร็จ
              <button
                type="button"
                onClick={() => void refetch()}
                className="shrink-0 font-semibold underline"
              >
                ลองอีกครั้ง
              </button>
            </div>
          )}

          {data && (
            <>
              {data.readiness.ok ? (
                <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <Check className="h-4 w-4 shrink-0" />
                  ข้อมูลครบตามที่ปลายทางต้องการ — รอเปิดขาส่งเท่านั้น
                </p>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    ยังส่งไม่ได้ {data.readiness.reasons.length} เรื่อง
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {data.readiness.reasons.map((r) => {
                      const skus = data.readiness.offendingSkus[r];
                      return (
                        <li key={r} className="text-[11px] text-amber-900 dark:text-amber-200/90">
                          • {erpReasonLabel(r)}
                          {skus && skus.length > 0 && (
                            <span className="ml-1 font-mono text-amber-700 dark:text-amber-300/80">
                              ({skus.slice(0, 5).join(", ")}
                              {skus.length > 5 ? ` +${skus.length - 5}` : ""})
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  ลูกค้า {data.context.customerCode || "—"} · เซลส์{" "}
                  {data.context.salesmanCode || "—"} · division{" "}
                  {data.context.divisionCode || "—"} · {data.payload.countItem} รายการ
                </p>
                <button
                  type="button"
                  onClick={() => void copyJson()}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors",
                    copied
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/60"
                  )}
                  title="คัดลอก JSON ไปให้ทีม ERP ตรวจ"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "คัดลอกแล้ว" : "คัดลอก JSON"}
                </button>
              </div>

              {/* กล่องกว้างเกินจอได้ — เลื่อนในกล่องตัวเอง ไม่ดันแผงทั้งแผงให้ล้น */}
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-2.5 text-[10px] leading-relaxed text-slate-100 dark:bg-slate-950">
                {json}
              </pre>
            </>
          )}
        </div>
      )}
    </section>
  );
}
