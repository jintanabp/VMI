"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PromoInspectorResult } from "@/lib/promo/promo-inspector";
import { plannerView, blendedNetForStep } from "@/lib/promo/planner-utils";

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

interface C4PromoModalProps {
  skuCode: string;
  storeCode: string;
  stagedQty: Record<string, number>;
  onClose: () => void;
  /** เมื่อมี callback จะแสดงปุ่มยืนยันเพื่อส่งจำนวนที่จำลองกลับหน้าหลัก */
  onConfirm?: (staged: Record<string, number>) => void;
}

export function C4PromoModal({
  skuCode,
  storeCode,
  stagedQty,
  onClose,
  onConfirm,
}: C4PromoModalProps) {
  const [data, setData] = useState<PromoInspectorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [staged, setStaged] = useState<Record<string, number>>({});
  const [initialStaged, setInitialStaged] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({
      sku: skuCode,
      storeCode,
    });
    fetch(`/api/promo/inspector?${q}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e))))
      .then((payload: PromoInspectorResult) => {
        if (!alive) return;
        setData(payload);
        const seed: Record<string, number> = {};
        for (const p of payload.products) {
          seed[p.product] = stagedQty[p.product] ?? 0;
        }
        setStaged(seed);
        setInitialStaged(seed);
      })
      .catch((e) => {
        if (alive) setErr(e?.error ?? "โหลดโปรไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [skuCode, storeCode, stagedQty]);

  const { pooled, activeIdx, activeStep, nextStep, mix } = useMemo(() => {
    if (!data) {
      return {
        pooled: 0,
        activeIdx: -1,
        activeStep: null,
        nextStep: null,
        mix: { avgNet: null, mixedPrice: false },
      };
    }
    return plannerView(data.products, data.ladder, staged);
  }, [data, staged]);

  const canAdjustGroup = Boolean(
    onConfirm && data?.group && data.products.length > 1
  );

  const hasChanges = useMemo(() => {
    if (!canAdjustGroup) return false;
    const keys = new Set([
      ...Object.keys(staged),
      ...Object.keys(initialStaged),
    ]);
    for (const k of keys) {
      if ((staged[k] ?? 0) !== (initialStaged[k] ?? 0)) return true;
    }
    return false;
  }, [canAdjustGroup, staged, initialStaged]);

  function handleConfirm() {
    if (!onConfirm) return;
    onConfirm({ ...staged });
    onClose();
  }

  const title = data?.group
    ? `โปร C4 · กลุ่ม ${data.group}`
    : `โปร C4 · ${data?.skuName ?? skuCode}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              ซื้อสินค้าใดก็ได้ในกลุ่มเดียวกัน รวมจำนวนแล้วได้โปรเดียวกัน
              {data?.context?.date ? ` · วันนี้ ${data.context.date}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด...</p>
          )}
          {err && (
            <p className="py-10 text-center text-sm text-red-600">{err}</p>
          )}

          {!loading && !err && data && (
            <div className="space-y-4">
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm dark:border-violet-800/50 dark:bg-violet-950/30">
                <p className="font-semibold text-violet-900 dark:text-violet-100">
                  รวมในกลุ่ม: <span className="tabular-nums">{pooled}</span> หีบ
                </p>
                {activeStep ? (
                  <p className="mt-1 text-xs text-violet-800 dark:text-violet-200">
                    ขั้นปัจจุบัน: ซื้อ {activeStep.fromQty}
                    {activeStep.toQty !== activeStep.fromQty
                      ? `–${activeStep.toQty}`
                      : ""}{" "}
                    หีบ → {activeStep.discountLabel || "ของแถม"}
                    {mix.avgNet != null && (
                      <> · net เฉลี่ย ฿{fmt(mix.avgNet)}/หีบ</>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
                    ยังไม่ถึงขั้นต่ำโปร
                    {nextStep
                      ? ` (ขั้นแรก ${nextStep.fromQty} หีบ)`
                      : ""}
                  </p>
                )}
                {mix.mixedPrice && (
                  <p className="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
                    SKU ในกลุ่มมีราคา credit ต่างกัน — net แสดงเป็นค่าเฉลี่ยถ่วงน้ำหนัก
                  </p>
                )}
              </div>

              {data.group && data.products.length > 1 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    สินค้าในกลุ่ม ({data.products.length} SKU)
                  </p>
                  <div className="space-y-2">
                    {data.products.map((p) => (
                      <div
                        key={p.product}
                        className={cn(
                          "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                          p.product === skuCode
                            ? "border-teal-300 bg-teal-50/80 dark:border-teal-700 dark:bg-teal-950/30"
                            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">
                            {p.product}
                          </p>
                          <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                            {p.name}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-slate-500">credit</p>
                          <p className="font-semibold tabular-nums">
                            {p.creditPrice != null ? `฿${fmt(p.creditPrice)}` : "—"}
                          </p>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs">
                          <span className="text-slate-500">หีบ</span>
                          <input
                            type="number"
                            min={0}
                            className="w-16 rounded border border-slate-200 px-2 py-1 text-right tabular-nums dark:border-slate-600 dark:bg-slate-800"
                            value={staged[p.product] ?? 0}
                            onChange={(e) =>
                              setStaged((m) => ({
                                ...m,
                                [p.product]: Math.max(
                                  0,
                                  Math.floor(Number(e.target.value) || 0)
                                ),
                              }))
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {canAdjustGroup
                      ? "ปรับจำนวนแล้วกด «ใช้จำนวนนี้» เพื่ออัปเดตรายการสั่ง"
                      : "ปรับจำนวนเพื่อจำลองรวมกลุ่ม"}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  ขั้นโปร (C4)
                </p>
                <div className="vmi-table-wrap">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                        <th className="px-2 py-2 font-semibold">ซื้อ (หีบ)</th>
                        <th className="px-2 py-2 text-right font-semibold">ส่วนลด</th>
                        <th className="px-2 py-2 text-right font-semibold">net/หีบ</th>
                        <th className="px-2 py-2 font-semibold">ของแถม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ladder.map((step, i) => {
                        const active = i === activeIdx;
                        const net = plannerView(
                          data.products,
                          data.ladder,
                          staged
                        );
                        const stepNet = active
                          ? net.mix.avgNet
                          : blendedNetForStep(data.products, staged, step).avgNet;
                        return (
                          <tr
                            key={`${step.fromQty}-${step.toQty}-${i}`}
                            className={cn(
                              "border-b border-slate-100 dark:border-slate-800",
                              active &&
                                "bg-violet-50 dark:bg-violet-950/40"
                            )}
                          >
                            <td className="px-2 py-2 font-medium">
                              {active && "▶ "}
                              {step.fromQty}
                              {step.toQty !== step.fromQty
                                ? `–${step.toQty}`
                                : "+"}{" "}
                              {step.unitLabel}
                            </td>
                            <td className="px-2 py-2 text-right font-mono">
                              {step.discBaht != null
                                ? `฿${fmt(step.discBaht)}`
                                : step.discPct != null
                                  ? `${fmt(step.discPct)}%`
                                  : "—"}
                            </td>
                            <td className="px-2 py-2 text-right font-mono font-semibold">
                              {stepNet != null ? fmt(stepNet) : "—"}
                            </td>
                            <td className="px-2 py-2">
                              {step.premiumProduct ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                  <Gift className="h-3 w-3" />
                                  {step.premiumName} ×{step.premiumQty}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {canAdjustGroup ? "ยกเลิก" : "ปิด"}
          </Button>
          {canAdjustGroup && (
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={!hasChanges}
            >
              ใช้จำนวนนี้
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface PromoInspectorTriggerProps {
  skuCode: string;
  storeCode: string;
  stagedQty?: Record<string, number>;
  onConfirmStaged?: (staged: Record<string, number>) => void;
  className?: string;
}

export function PromoInspectorTrigger({
  skuCode,
  storeCode,
  stagedQty = {},
  onConfirmStaged,
  className,
}: PromoInspectorTriggerProps) {
  const [open, setOpen] = useState(false);

  if (!storeCode) return null;

  return (
    <>
      <button
        type="button"
        title="ดูโปร C4 / กลุ่มสินค้า"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300",
          className
        )}
      >
        <Eye className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open && (
        <C4PromoModal
          skuCode={skuCode}
          storeCode={storeCode}
          stagedQty={stagedQty}
          onConfirm={onConfirmStaged}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
