"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Gift, Printer, Sparkles, X } from "lucide-react";
import { appPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { formatBaht, formatNumber } from "@/lib/calculations";
import { formatStoreLabel } from "@/lib/format-store-label";
import { collectOwedFreeGoods } from "@/lib/promo/order-free-goods";
import { cn } from "@/lib/utils";
import type { PoDocument } from "@/lib/po/po-document";

const KIND_LABEL: Record<string, string> = {
  c4: "ราคาตรง C4",
  override: "ราคาไม่ตรง C4",
  mixed: "ราคาผสม",
};

const SOURCE_LABEL: Record<string, string> = {
  sales: "พนักงานตั้ง",
  store: "ร้านขอ",
  c4: "ราคาระบบ",
  none: "ไม่มีราคา",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * รายละเอียด PO บนหน้าเว็บ
 *
 * เดิมดูรายการใน PO ได้ทางเดียวคือโหลดไฟล์ Excel/JSON ออกมาเปิด
 * — ตอบคำถาม "ใบนี้มีอะไรบ้าง" ไม่ได้เลยถ้าไม่มีโปรแกรมเปิดไฟล์
 * `?format=view` ประกอบเอกสารจาก DB ให้เมื่อไฟล์บนดิสก์หาย
 */
export function PoDetailPanel({
  poNumber,
  onClose,
}: {
  poNumber: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery<PoDocument>({
    queryKey: ["po-detail", poNumber],
    queryFn: async () => {
      const res = await fetch(
        appPath(
          `/api/sales/purchase-orders/${encodeURIComponent(poNumber)}?format=view`
        )
      );
      if (!res.ok) throw new Error(`โหลดรายละเอียด PO ไม่สำเร็จ (${res.status})`);
      return res.json();
    },
  });

  const owedFreeGoods = useMemo(
    () => (data ? collectOwedFreeGoods(data.lines) : []),
    [data]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="vmi-po-overlay fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียด PO ${poNumber}`}
        className="vmi-po-detail flex h-full w-full max-w-3xl flex-col bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
              {poNumber}
            </h2>
            {data && (
              <p className="truncate text-xs text-slate-500">
                {formatStoreLabel(data.storeCode, data.storeName)} · กลุ่ม{" "}
                {data.groupKey} ·{" "}
                {KIND_LABEL[data.priceKind] ?? data.priceKind}
              </p>
            )}
          </div>
          <div className="vmi-po-actions flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  appPath(
                    `/api/sales/purchase-orders/${encodeURIComponent(poNumber)}`
                  ),
                  "_blank",
                  "noopener"
                )
              }
            >
              <Download className="h-4 w-4" />
              Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              พิมพ์
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="ปิด">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isLoading && (
            <p className="py-10 text-center text-sm text-slate-500">
              กำลังโหลด...
            </p>
          )}
          {isError && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <span>โหลดรายละเอียด PO ไม่สำเร็จ</span>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                ลองใหม่
              </Button>
            </div>
          )}

          {data && (
            <>
              <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-slate-400">ออกเมื่อ</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200">
                    {fmtDateTime(data.approvedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">โดย</dt>
                  <dd className="truncate font-medium text-slate-800 dark:text-slate-200">
                    {data.approvedBy || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">รายการ</dt>
                  <dd className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                    {formatNumber(data.itemCount, 0)} · {formatNumber(data.totalQty, 0)} หีบ
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">รวมทั้งสิ้น (รวม VAT)</dt>
                  <dd className="font-bold tabular-nums text-teal-700 dark:text-teal-400">
                    {formatBaht(data.grandTotal)}
                  </dd>
                </div>
              </dl>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[40rem] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">รหัส</th>
                      <th className="px-3 py-2 font-medium">ชื่อสินค้า</th>
                      <th className="px-3 py-2 text-right font-medium">หีบ</th>
                      <th className="px-3 py-2 text-right font-medium">
                        ราคา/หีบ
                      </th>
                      <th className="px-3 py-2 font-medium">ที่มาราคา</th>
                      <th className="px-3 py-2 font-medium">โปรที่ได้</th>
                      <th className="px-3 py-2 text-right font-medium">
                        สุทธิ/หีบ
                      </th>
                      <th className="px-3 py-2 text-right font-medium">มูลค่า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr
                        key={l.skuCode}
                        className={cn(
                          "border-t border-slate-100 dark:border-slate-800",
                          l.priceFlagged && "bg-amber-50/60 dark:bg-amber-950/20"
                        )}
                      >
                        <td className="px-3 py-1.5 font-mono text-teal-700 dark:text-teal-400">
                          {l.skuCode}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                          {l.skuName}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {formatNumber(l.qty, 0)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatBaht(l.unitPrice) ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-1.5 whitespace-nowrap",
                            l.priceFlagged
                              ? "font-semibold text-amber-700 dark:text-amber-400"
                              : "text-slate-500"
                          )}
                          title={l.priceFlagReason ?? undefined}
                        >
                          {SOURCE_LABEL[l.priceSource] ?? l.priceSource}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                          {l.promoLabel ? (
                            <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                              <Sparkles className="h-3 w-3" />
                              {l.promoLabel}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatBaht(l.netUnitPrice) ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                          {formatBaht(l.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                      <td
                        colSpan={2}
                        className="px-3 py-1.5 font-medium text-slate-500"
                      >
                        รวม
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                        {formatNumber(data.totalQty, 0)}
                      </td>
                      <td colSpan={4} className="px-3 py-1.5 text-right text-slate-500">
                        มูลค่า / VAT
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                        {formatBaht(data.totalAmount)}
                        <span className="ml-1 font-normal text-slate-400">
                          + {formatBaht(data.vatTotal)}
                        </span>
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200 dark:border-slate-700">
                      <td
                        colSpan={7}
                        className="px-3 py-1.5 text-right font-medium text-slate-600 dark:text-slate-300"
                      >
                        ยอดรวมทั้งสิ้น (รวม VAT)
                      </td>
                      <td className="px-3 py-1.5 text-right font-bold tabular-nums text-teal-700 dark:text-teal-400">
                        {formatBaht(data.grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ยอดที่ dedupe แล้ว — โปรกลุ่มติดของแถมมาทุกบรรทัด ห้ามบวกจากคอลัมน์ในตาราง */}
              {owedFreeGoods.length > 0 && (
                <section className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-violet-900 dark:text-violet-200">
                    <Gift className="h-4 w-4" />
                    ของแถมที่ต้องส่ง
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {owedFreeGoods.map((fg) => (
                      <li
                        key={`${fg.promoGroup ?? ""}-${fg.code}`}
                        className="flex items-baseline justify-between gap-2 text-xs"
                      >
                        <span className="min-w-0 text-slate-700 dark:text-slate-200">
                          <span className="font-mono text-violet-700 dark:text-violet-300">
                            {fg.code}
                          </span>{" "}
                          {fg.name}
                          <span className="ml-1 text-slate-400">
                            {fg.promoGroup
                              ? `· กลุ่ม ${fg.promoGroup} (${fg.fromSkuCodes.join(", ")})`
                              : `· ${fg.fromSkuCodes.join(", ")}`}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-violet-800 dark:text-violet-200">
                          {formatNumber(fg.qty, 0)}
                          {fg.unit ? ` ${fg.unit}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
