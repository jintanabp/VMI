"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Send,
} from "lucide-react";
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
 * ส่วน "payload ที่จะส่งเข้า ERP" ในแผงรายละเอียด PO
 *
 * มีปุ่มส่งแล้วตั้งแต่ 11 ก.ย. 69 แต่**สวิตช์ส่งจริงยังปิดอยู่** ⇒ ปุ่มขึ้นแบบกดไม่ได้
 * พร้อมเหตุผล · ตั้งใจให้เห็นปุ่มทั้งที่ยังกดไม่ได้ เพราะ "ไม่มีปุ่ม" กับ "มีปุ่มแต่ยังไม่เปิด"
 * เป็นคนละสถานะ และคนที่เปิดจอมาต้องแยกออก
 *
 * ปลายทาง (`insertOCROrderToBill`) ล็อกคู่ orderNo+customerCode ไว้ 6 เดือนเมื่อส่งซ้ำ
 * และไม่มีทาง resend ⇒ ปุ่มนี้จึงยืนยันก่อนเสมอ ไม่มี auto-retry และกดซ้ำไม่ได้เมื่อส่งไปแล้ว
 */

interface ErpPreview {
  /** ISO เวลาที่ส่งสำเร็จ — null = ยังไม่เคยส่ง */
  erpSentAt: string | null;
  /** ขาส่งเปิดหรือยัง — false = ปุ่มต้องปิดแม้ใบจะพร้อมแล้ว */
  sendEnabled: boolean;
  sendDisabledReason: string;
  payload: ErpOrderPayload;
  readiness: ErpReadiness;
  context: ErpPayloadContext;
}

export function PoErpPayloadSection({ poNumber }: { poNumber: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<string>("");
  const qc = useQueryClient();

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

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        appPath(
          `/api/sales/purchase-orders/${encodeURIComponent(poNumber)}/send-erp/`
        ),
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `ส่งไม่สำเร็จ (${res.status})`);
      return body as {
        insertedRows: number | null;
        sentRows: number | null;
        rowsMismatch: boolean;
      };
    },
    onSuccess: (r) => {
      setSendError("");
      setConfirming(false);
      setSendResult(
        r.rowsMismatch
          ? `ปลายทางรับไป ${r.insertedRows} บรรทัด แต่เราส่งไป ${r.sentRows} — ต้องตรวจกับ ERP`
          : "ส่งเข้า ERP แล้ว"
      );
      // รายการ PO ข้างนอกถือสถานะอยู่ ต้องโหลดใหม่ ไม่งั้นป้ายยังเป็นของเก่า
      void qc.invalidateQueries({ queryKey: ["sales-purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["po-erp-payload", poNumber] });
    },
    onError: (e) => {
      setConfirming(false);
      setSendError(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
    },
  });

  // มาจาก response เดียวกับ payload — แผงแม่ไม่ต้องรู้เรื่องนี้เลย
  const erpSentAt = data?.erpSentAt ?? null;
  const alreadySent = Boolean(erpSentAt);
  /** เหตุผลที่กดไม่ได้ — null = กดได้ · เรียงตามลำดับที่คนจะเจอจริง */
  const blockedReason = alreadySent
    ? "ใบนี้ส่งเข้า ERP ไปแล้ว — ส่งซ้ำไม่ได้ (ปลายทางล็อกเลขไว้ 6 เดือน)"
    : !data
      ? "ยังโหลดข้อมูลไม่เสร็จ"
      : !data.readiness.ok
        ? `ยังส่งไม่ได้ ${data.readiness.reasons.length} เรื่อง — ดูรายการข้างบน`
        : // ใบพร้อมแล้วแต่ขาส่งยังไม่เปิด — ต้องบอกตรงนี้ ไม่ใช่ปล่อยให้กดแล้วเจอ 503
          !data.sendEnabled
          ? data.sendDisabledReason
          : null;

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
        <span
          className={cn(
            "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
            erpSentAt
              ? "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"
              : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          )}
        >
          {erpSentAt ? "ส่งเข้า ERP แล้ว" : "ยังไม่ส่ง"}
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
                  ข้อมูลครบตามที่ปลายทางต้องการ
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

              {/* ปุ่มส่ง — ขึ้นเสมอแม้กดไม่ได้ เพราะ "ไม่มีปุ่ม" กับ "มีปุ่มแต่ยังไม่เปิด"
                  เป็นคนละเรื่อง และคนเปิดจอมาต้องแยกออก */}
              <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                {sendResult ? (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                    <Check className="h-4 w-4 shrink-0" />
                    {sendResult}
                  </p>
                ) : confirming ? (
                  <div>
                    <p className="text-xs font-bold text-red-700 dark:text-red-300">
                      ยืนยันส่ง {poNumber} เข้า ERP?
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                      <b>ย้อนกลับไม่ได้</b> — ปลายทางล็อกเลขใบนี้ไว้ 6 เดือนทันทีที่รับ
                      และไม่มีทางยกเลิกหรือส่งใหม่ด้วยเลขเดิม
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => sendMutation.mutate()}
                        disabled={sendMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {sendMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        ส่งเลย
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        disabled={sendMutation.isPending}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/60"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSendError("");
                        setConfirming(true);
                      }}
                      disabled={blockedReason != null || sendMutation.isPending}
                      title={blockedReason ?? "ส่งใบนี้เข้า ERP (ยืนยันอีกครั้งก่อนส่งจริง)"}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
                    >
                      <Send className="h-3.5 w-3.5" />
                      ส่งเข้า ERP
                    </button>
                    {blockedReason && (
                      <span className="min-w-0 flex-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {blockedReason}
                      </span>
                    )}
                  </div>
                )}

                {sendError && (
                  <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                    {sendError}
                  </p>
                )}
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
