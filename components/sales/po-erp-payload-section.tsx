"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { appPath } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  /** ข้อความล้มเหลวล่าสุด — null = ยังไม่เคยพลาด (หรือยังไม่เคยส่ง) */
  erpError: string | null;
  /** "rejected" | "timeout" | "network" | "http_error" | null — ดู clone-for-erp.ts */
  erpFailureKind: string | null;
  /** ใบนี้ขอเลขใหม่มาจากใบไหน — null = ใบปกติ */
  erpReplacesPoNumber: string | null;
  /** ใบนี้ถูกแทนที่ด้วยเลขใหม่ไปแล้วหรือยัง */
  replacedByPoNumber: string | null;
  /** ขาส่งเปิดหรือยัง — false = ปุ่มต้องปิดแม้ใบจะพร้อมแล้ว */
  sendEnabled: boolean;
  sendDisabledReason: string;
  payload: ErpOrderPayload;
  readiness: ErpReadiness;
  context: ErpPayloadContext;
}

export function PoErpPayloadSection({
  poNumber,
  isAdmin = false,
}: {
  poNumber: string;
  /** เห็น JSON ดิบ + ปุ่มคัดลอกได้ไหม — พนักงานทั่วไปไม่ต้องเห็น มีแต่ dev/แอดมินที่ต้องใช้ debug */
  isAdmin?: boolean;
}) {
  // เปิดค้างไว้เป็นค่าเริ่มต้น — เดิมต้องกดกางก่อนปุ่ม "ส่งเข้า ERP" ถึงจะโผล่ ทำให้ดูเหมือน
  // ไม่มีปุ่มทั้งที่มี (14 ก.ย. 69 ยังปิดไว้เพราะกลัวยิง query โดยไม่จำเป็น แต่ผู้ใช้อยากให้เห็น
  // สถานะ/ปุ่มทันทีที่เปิด PO มากกว่า) — ยังกดพับเก็บได้เหมือนเดิมถ้าไม่อยากเห็น
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<string>("");
  const [cloneError, setCloneError] = useState("");
  const [cloneResult, setCloneResult] = useState<string>("");
  const qc = useQueryClient();

  // ผูกกับ open เผื่อคนกดพับเก็บ — จะได้ไม่ต้องยิง query ซ้ำตอนพับอยู่
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

  const cloneMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        appPath(
          `/api/sales/purchase-orders/${encodeURIComponent(poNumber)}/clone-for-erp/`
        ),
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `ขอเลขใหม่ไม่สำเร็จ (${res.status})`);
      return body as { poNumber: string };
    },
    onSuccess: (r) => {
      setCloneError("");
      setCloneResult(`ขอเลขใหม่แล้ว — ใบใหม่คือ ${r.poNumber}`);
      void qc.invalidateQueries({ queryKey: ["sales-purchase-orders"] });
      void qc.invalidateQueries({ queryKey: ["po-erp-payload", poNumber] });
    },
    onError: (e) => {
      setCloneError(e instanceof Error ? e.message : "ขอเลขใหม่ไม่สำเร็จ");
    },
  });

  // มาจาก response เดียวกับ payload — แผงแม่ไม่ต้องรู้เรื่องนี้เลย
  const erpSentAt = data?.erpSentAt ?? null;
  const alreadySent = Boolean(erpSentAt);
  const replacedBy = data?.replacedByPoNumber ?? null;

  // ขอเลขใหม่ได้เฉพาะเมื่อปลายทางปฏิเสธชัดเจน ("rejected") เท่านั้น — timeout/network
  // แปลว่ายังไม่รู้ว่าเข้าไปแล้วหรือไม่ ขอเลขใหม่ตอนนั้นเสี่ยงส่งซ้ำสองเลข
  const isConfirmedRejection = data?.erpFailureKind === "rejected";
  const isAmbiguousFailure = Boolean(
    data?.erpError && data?.erpFailureKind && data.erpFailureKind !== "rejected"
  );
  const canRequestNewNumber = Boolean(
    isConfirmedRejection && !alreadySent && !replacedBy
  );

  /**
   * เหตุผลที่กดไม่ได้ — null = กดได้ · เรียงตามลำดับที่คนจะเจอจริง
   *
   * ⚠️ **บั๊กที่เจอจากการทดสอบจริง 14 ก.ย. 69 (แก้แล้ว):** เดิม `erpError`/
   * `erpFailureKind` ไม่ได้เช็คตรงนี้เลย — ใบที่เคยพลาด (ทั้งปฏิเสธชัดเจนและ timeout)
   * ปุ่ม "ส่งเข้า ERP" ใบเดิมยังกดได้ปกติ ทั้งที่กล่องเตือนข้าง ๆ บอกว่าห้ามส่งซ้ำ — ขัดกันเอง
   * และเสี่ยงให้กดส่งซ้ำเลขเดิมได้จริง ต้องกันไว้ที่ปุ่มด้วย ไม่ใช่แค่โชว์คำเตือนลอย ๆ
   */
  const blockedReason = alreadySent
    ? "ใบนี้ส่งเข้า ERP ไปแล้ว — ส่งซ้ำไม่ได้ (ปลายทางล็อกเลขไว้ 6 เดือน)"
    : replacedBy
      ? `ใบนี้ถูกแทนที่ด้วยเลขใหม่แล้ว (${replacedBy}) — ไปส่งที่ใบใหม่แทน`
      : isConfirmedRejection
        ? "ใบนี้เคยถูก ERP ปฏิเสธ — ส่งซ้ำด้วยเลขเดิมไม่ได้ ต้องขอเลขใหม่ก่อน (ดูกล่องด้านล่าง)"
        : isAmbiguousFailure
          ? "ผลการส่งครั้งก่อนไม่ชัดเจน — ห้ามส่งซ้ำจนกว่าจะตรวจกับทีม ERP ก่อน (ดูกล่องด้านล่าง)"
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

              {data.readiness.notices.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-950/20">
                  <ul className="space-y-1">
                    {data.readiness.notices.map((n) => (
                      <li
                        key={n}
                        className="flex items-start gap-1.5 text-[11px] text-sky-900 dark:text-sky-200/90"
                      >
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {erpReasonLabel(n)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.erpReplacesPoNumber && (
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  ใบนี้ขอเลขใหม่มาแทนใบ{" "}
                  <span className="font-mono">{data.erpReplacesPoNumber}</span> ที่ ERP
                  เคยปฏิเสธ
                </p>
              )}

              {isAmbiguousFailure && !alreadySent && !replacedBy && (
                <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/20">
                  {/* icon + ข้อความต้องเป็นแค่ 2 flex item — เดิมใส่ flex บน <p> ที่มี
                      text node กับ <b> เป็น sibling กัน ทำให้แต่ละท่อนข้อความกลายเป็นคนละ
                      flex item แล้วเรียงเป็นคอลัมน์แคบ ๆ ข้างกันแทนที่จะไหลเป็นย่อหน้าเดียว
                      (เจอจากทดสอบจริงที่หน้าจอแคบ 14 ก.ย. 69) — ห่อข้อความทั้งก้อนใน span เดียว */}
                  <p className="flex items-start gap-1.5 text-[11px] text-red-800 dark:text-red-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      ยิงครั้งก่อนไม่ชัดเจนว่าเข้า ERP หรือไม่ (ปลายทางไม่ตอบ/เน็ตมีปัญหา) —{" "}
                      <b>ห้ามขอเลขใหม่หรือส่งซ้ำเอง</b> ต้องให้คนตรวจกับทีม ERP ก่อนว่าใบนี้
                      เข้าไปแล้วหรือยัง
                    </span>
                  </p>
                  {/* ข้อความ error ดิบมีคำเตือนสำคัญปนอยู่ ("ห้ามส่งซ้ำ...") — ห้าม truncate
                      ทิ้ง เดิมตัดจนคำเตือนหายไปทั้งประโยคที่หน้าจอแคบ ให้ขึ้นบรรทัดแทน */}
                  <p className="mt-0.5 break-words text-[10px] text-red-600 dark:text-red-300/80">
                    {data.erpError}
                  </p>
                </div>
              )}

              {canRequestNewNumber && (
                <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <p className="text-[11px] text-amber-900 dark:text-amber-200">
                    ใบนี้เคยยิงเข้า ERP แล้วไม่สำเร็จ — <b>ส่งซ้ำด้วยเลขเดิมไม่ได้</b>{" "}
                    ต้องขอเลขใหม่ก่อน
                  </p>
                  <p className="mt-0.5 break-words text-[10px] text-amber-700 dark:text-amber-300/80">
                    {data.erpError}
                  </p>
                  {cloneResult ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                      <Check className="h-4 w-4 shrink-0" />
                      {cloneResult}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => cloneMutation.mutate()}
                      disabled={cloneMutation.isPending}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950/40"
                    >
                      {cloneMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      ขอเลขใหม่แล้วลองส่งอีกครั้ง
                    </button>
                  )}
                  {cloneError && (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                      {cloneError}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  ลูกค้า {data.context.customerCode || "—"} · เซลส์{" "}
                  {data.context.salesmanCode || "—"} · division{" "}
                  {data.context.divisionCode || "—"} · {data.payload.countItem} รายการ
                </p>
                {isAdmin && (
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
                )}
              </div>

              {/* ปุ่มส่ง — ขึ้นเสมอแม้กดไม่ได้ เพราะ "ไม่มีปุ่ม" กับ "มีปุ่มแต่ยังไม่เปิด"
                  เป็นคนละเรื่อง และคนเปิดจอมาต้องแยกออก — กล่องเปลี่ยนสีตามสถานะเพื่อให้
                  เห็นชัดตั้งแต่ไกลว่า "พร้อมส่งแล้ว" กับ "ยังส่งไม่ได้" ต่างกัน ไม่ต้องอ่าน
                  ข้อความก่อนถึงจะรู้ */}
              <div
                className={cn(
                  "mt-3 rounded-xl border-2 px-4 py-3",
                  sendResult
                    ? "border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/20"
                    : blockedReason
                      ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40"
                      : "border-teal-300 bg-teal-50/60 dark:border-teal-800/70 dark:bg-teal-950/10"
                )}
              >
                {sendResult ? (
                  <p className="flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-300">
                    <Check className="h-5 w-5 shrink-0" />
                    {sendResult}
                  </p>
                ) : confirming ? (
                  <div>
                    <p className="text-sm font-bold text-red-700 dark:text-red-300">
                      ยืนยันส่ง {poNumber} เข้า ERP?
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      <b>ย้อนกลับไม่ได้</b> — ปลายทางล็อกเลขใบนี้ไว้ 6 เดือนทันทีที่รับ
                      และไม่มีทางยกเลิกหรือส่งใหม่ด้วยเลขเดิม
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => sendMutation.mutate()}
                        pending={sendMutation.isPending}
                        className="h-10 px-4 text-sm"
                      >
                        {!sendMutation.isPending && <Send className="h-4 w-4" />}
                        ส่งเลย
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setConfirming(false)}
                        disabled={sendMutation.isPending}
                        className="h-10 px-4 text-sm"
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => {
                        setSendError("");
                        setConfirming(true);
                      }}
                      disabled={blockedReason != null || sendMutation.isPending}
                      title={blockedReason ?? "ส่งใบนี้เข้า ERP (ยืนยันอีกครั้งก่อนส่งจริง)"}
                      className="h-10 px-4 text-sm"
                    >
                      <Send className="h-4 w-4" />
                      ส่งเข้า ERP
                    </Button>
                    {blockedReason ? (
                      <span className="min-w-0 flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {blockedReason}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                        พร้อมส่งแล้ว
                      </span>
                    )}
                  </div>
                )}

                {sendError && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    {sendError}
                  </p>
                )}
              </div>

              {/* JSON ดิบ — พนักงานทั่วไปไม่ต้องเห็น เอาไว้ให้ dev/แอดมิน debug เทียบกับสเปกเท่านั้น
                  กล่องกว้างเกินจอได้ — เลื่อนในกล่องตัวเอง ไม่ดันแผงทั้งแผงให้ล้น */}
              {isAdmin && (
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-2.5 text-[10px] leading-relaxed text-slate-100 dark:bg-slate-950">
                  {json}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
