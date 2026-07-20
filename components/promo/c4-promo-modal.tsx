"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Gift, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PromoInspectorResult } from "@/lib/promo/promo-inspector";
import {
  filterProductsToStockMembers,
  lookupStagedQty,
  seedModalStaged,
} from "@/lib/promo/stock-pooled-promo";
import { plannerView, blendedNetForStep } from "@/lib/promo/planner-utils";

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

interface C4PromoModalProps {
  skuCode: string;
  storeCode: string;
  /** โหลด modal ตามกลุ่ม ASSORTEDPRODUCTGROUP โดยตรง (แม่นยำกว่า resolve จาก sku) */
  promoGroup?: string;
  stagedQty: Record<string, number>;
  onClose: () => void;
  /** เมื่อมี callback จะแสดงปุ่มยืนยันเพื่อส่งจำนวนที่จำลองกลับหน้าหลัก */
  onConfirm?: (staged: Record<string, number>) => void;
  /** map รหัสสินค้า -> จำนวนแนะนำสั่ง สำหรับ mark "แนะนำซื้อ" */
  suggestByProduct?: Record<string, number>;
  /** ดูอย่างเดียว — ไม่ให้ปรับ qty / ไม่มีปุ่มใช้จำนวนนี้ */
  readOnly?: boolean;
  /** SKU ที่ร้านมีในสต็อก — กรองรายการในกลุ่มให้ตรงกับหน้าหลัก */
  stockMemberSkus?: string[];
}

export function C4PromoModal({
  skuCode,
  storeCode,
  promoGroup,
  stagedQty,
  onClose,
  onConfirm,
  suggestByProduct,
  readOnly = false,
  stockMemberSkus,
}: C4PromoModalProps) {
  const [data, setData] = useState<PromoInspectorResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [staged, setStaged] = useState<Record<string, number>>({});
  const stagedQtyRef = useRef(stagedQty);
  stagedQtyRef.current = stagedQty;
  const stockMemberSkusRef = useRef(stockMemberSkus);
  stockMemberSkusRef.current = stockMemberSkus;

  const visibleProducts = useMemo(() => {
    if (!data) return [];
    return filterProductsToStockMembers(data.products, stockMemberSkus);
  }, [data, stockMemberSkus]);

  const c4GroupSize = data?.products.length ?? 0;
  const storeGroupSize = visibleProducts.length;
  const groupSizeMismatch =
    Boolean(data?.group) &&
    stockMemberSkus &&
    stockMemberSkus.length > 0 &&
    c4GroupSize > storeGroupSize;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    setStaged({});
    const q = new URLSearchParams({ storeCode });
    const group = promoGroup?.trim();
    if (group) q.set("group", group);
    else q.set("sku", skuCode);
    fetch(`/api/promo/inspector?${q}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e))))
      .then((payload: PromoInspectorResult) => {
        if (!alive) return;
        setData(payload);
        const products = filterProductsToStockMembers(
          payload.products,
          stockMemberSkusRef.current
        );
        setStaged(seedModalStaged(products, stagedQtyRef.current));
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
  }, [skuCode, storeCode, promoGroup]);

  const { pooled, activeIdx, activeStep, nextStep, mix } = useMemo(() => {
    if (!data || visibleProducts.length === 0) {
      return {
        pooled: 0,
        activeIdx: -1,
        activeStep: null,
        nextStep: null,
        mix: { avgNet: null, mixedPrice: false },
      };
    }
    return plannerView(visibleProducts, data.ladder, staged);
  }, [data, staged, visibleProducts]);

  const canConfirmQty = Boolean(
    !readOnly && onConfirm && visibleProducts.length > 0
  );
  const isGroupView = Boolean(data?.group && visibleProducts.length > 1);
  const showProductQtyList = Boolean(
    data?.group && visibleProducts.length > 0 && !readOnly
  );

  const hasChanges = useMemo(() => {
    if (!canConfirmQty || visibleProducts.length === 0) return false;
    for (const p of visibleProducts) {
      const baseline = lookupStagedQty(stagedQty, p.product);
      if ((staged[p.product] ?? 0) !== baseline) return true;
    }
    return false;
  }, [canConfirmQty, visibleProducts, staged, stagedQty]);

  function handleConfirm() {
    if (!onConfirm || !hasChanges) return;
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
              {isGroupView
                ? "ซื้อสินค้าใดก็ได้ในกลุ่มเดียวกัน รวมจำนวนแล้วได้โปรเดียวกัน"
                : "รายละเอียดบันไดโปร C4 รายสินค้า"}
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
                  {isGroupView ? (
                    <>
                      รวมในกลุ่ม:{" "}
                      <span className="tabular-nums">{pooled}</span> หีบ
                    </>
                  ) : (
                    <>
                      จำนวนสั่ง:{" "}
                      <span className="tabular-nums">{pooled}</span> หีบ
                    </>
                  )}
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

              {!isGroupView && canConfirmQty && visibleProducts.length === 1 && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600 dark:text-slate-400">
                    จำนวนสั่ง (หีบ)
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-right tabular-nums dark:border-slate-600 dark:bg-slate-800"
                    value={staged[visibleProducts[0]!.product] ?? 0}
                    onChange={(e) => {
                      const code = visibleProducts[0]!.product;
                      setStaged((m) => ({
                        ...m,
                        [code]: Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0)
                        ),
                      }));
                    }}
                  />
                </label>
              )}

              {showProductQtyList && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    สินค้าในกลุ่ม ({storeGroupSize} SKU)
                  </p>
                  {groupSizeMismatch && (
                    <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                      กลุ่มโปร C4 มี {c4GroupSize} SKU — ร้านนี้มีในสต็อก{" "}
                      {storeGroupSize} SKU (แสดงเฉพาะที่สั่งได้)
                    </p>
                  )}
                  <div className="space-y-2">
                    {[...visibleProducts]
                      .sort((a, b) => {
                        const sa =
                          (suggestByProduct?.[a.product] ?? 0) > 0 ? 0 : 1;
                        const sb =
                          (suggestByProduct?.[b.product] ?? 0) > 0 ? 0 : 1;
                        if (sa !== sb) return sa - sb;
                        return a.product.localeCompare(b.product, undefined, {
                          numeric: true,
                        });
                      })
                      .map((p) => (
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
                          <p className="flex items-center gap-1.5 font-mono text-xs font-bold text-teal-700 dark:text-teal-400">
                            {p.product}
                            {(suggestByProduct?.[p.product] ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 font-sans text-[9px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                                แนะนำ {suggestByProduct![p.product]} หีบ
                              </span>
                            )}
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
                        {readOnly ? (
                          <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                            {staged[p.product] ?? 0} หีบ
                          </span>
                        ) : (
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
                        )}
                      </div>
                    ))}
                  </div>
                  {!readOnly && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      {canConfirmQty
                        ? "ปรับจำนวนแล้วกด «ใช้จำนวนนี้» เพื่ออัปเดตรายการสั่ง"
                        : "ปรับจำนวนเพื่อจำลองรวมกลุ่ม"}
                    </p>
                  )}
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
                          visibleProducts,
                          data.ladder,
                          staged
                        );
                        const stepNet = active
                          ? net.mix.avgNet
                          : blendedNetForStep(
                              visibleProducts,
                              staged,
                              step
                            ).avgNet;
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
            {canConfirmQty ? "ยกเลิก" : "ปิด"}
          </Button>
          {canConfirmQty && (
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
  promoGroup?: string;
  stagedQty?: Record<string, number>;
  onConfirmStaged?: (staged: Record<string, number>) => void;
  suggestByProduct?: Record<string, number>;
  readOnly?: boolean;
  label?: string;
  className?: string;
  applyVersion?: number;
  /** SKU ที่ร้านมีในสต็อก — กรองรายการในกลุ่มให้ตรงกับหน้าหลัก */
  stockMemberSkus?: string[];
}

export function PromoInspectorTrigger({
  skuCode,
  storeCode,
  promoGroup,
  stagedQty = {},
  onConfirmStaged,
  suggestByProduct,
  readOnly = false,
  label = "โปรกลุ่ม",
  className,
  applyVersion = 0,
  stockMemberSkus,
}: PromoInspectorTriggerProps) {
  const [open, setOpen] = useState(false);

  if (!storeCode) return null;

  return (
    <>
      <button
        type="button"
        title={readOnly ? "ดูรายละเอียดโปร" : "ดูโปรโมชั่น / บันได C4"}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-sky-100 px-1.5 text-sky-800 ring-1 ring-sky-300 transition-colors",
          "hover:bg-sky-200 hover:ring-sky-400",
          "dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-500/40 dark:hover:bg-sky-500/30",
          className
        )}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        <span className="text-[10px] font-bold leading-none">{label}</span>
      </button>
      {open && (
        <C4PromoModal
          key={`${promoGroup ?? skuCode}-${applyVersion}`}
          skuCode={skuCode}
          storeCode={storeCode}
          promoGroup={promoGroup}
          stagedQty={stagedQty}
          stockMemberSkus={stockMemberSkus}
          onConfirm={readOnly ? undefined : onConfirmStaged}
          suggestByProduct={suggestByProduct}
          readOnly={readOnly}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
