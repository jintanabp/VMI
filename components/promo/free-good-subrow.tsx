"use client";

import { CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** ข้อมูลของแถมที่ต้องใช้แสดงแถวย่อย (stock / order) */
export interface FreeGoodDisplay {
  premiumProduct: string;
  premiumName: string;
  qty: number;
  unitLabel: string;
  tierFromQty: number;
  tierPremiumQty: number;
}

export function freeGoodRuleLabel(freeGood: FreeGoodDisplay): string {
  return `ซื้อ ${freeGood.tierFromQty} แถม ${freeGood.tierPremiumQty}`;
}

/** แถวย่อยของแถมในตาราง stock (13 คอลัมน์) */
export function FreeGoodStockTableRow({
  freeGood,
}: {
  freeGood: FreeGoodDisplay;
}) {
  const rule = freeGoodRuleLabel(freeGood);
  return (
    <tr
      className="border-t border-violet-100/60 bg-violet-50/40 text-slate-700 dark:border-violet-900/30 dark:bg-violet-950/15 dark:text-slate-300"
      title={`${rule} — ได้แถมอัตโนมัติเมื่อสั่งสินค้าด้านบน ไม่ต้องเลือกสั่ง`}
    >
      <td className="relative px-1 py-1.5 align-middle">
        <FreeGoodConnectorRail />
      </td>
      <td className="px-1 py-1.5" colSpan={2}>
        <FreeGoodIdentity freeGood={freeGood} rule={rule} />
      </td>
      <td className="px-1 py-1.5 text-slate-400" colSpan={3}>
        —
      </td>
      <td className="px-1 py-1.5 text-center">
        <FreeGoodQty freeGood={freeGood} />
      </td>
      <td
        className="px-1 py-1.5 text-center text-[10px] text-slate-500 dark:text-slate-400"
        colSpan={5}
      >
        <FreeGoodRuleInline rule={rule} />
      </td>
    </tr>
  );
}

/** แถวย่อยของแถมในตาราง order (11 คอลัมน์) */
export function FreeGoodOrderTableRow({
  freeGood,
}: {
  freeGood: FreeGoodDisplay;
}) {
  const rule = freeGoodRuleLabel(freeGood);
  return (
    <tr
      className="border-t border-violet-100/60 bg-violet-50/40 text-slate-700 dark:border-violet-900/30 dark:bg-violet-950/15 dark:text-slate-300"
      title={`${rule} — ได้แถมอัตโนมัติเมื่อสั่งสินค้าด้านบน ไม่ต้องเลือกสั่ง`}
    >
      <td className="relative px-3 py-2 align-middle">
        <FreeGoodConnectorRail className="left-[18px]" />
      </td>
      <td className="px-3 py-2" colSpan={2}>
        <FreeGoodIdentity freeGood={freeGood} rule={rule} />
      </td>
      <td className="px-2 py-2 text-right">
        <FreeGoodQty freeGood={freeGood} align="end" />
      </td>
      <td className="px-2 py-2 text-center text-slate-400" colSpan={6}>
        —
      </td>
      <td className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400">
        <FreeGoodRuleInline rule={rule} />
      </td>
    </tr>
  );
}

export function FreeGoodMobileCard({
  freeGood,
}: {
  freeGood: FreeGoodDisplay;
}) {
  const rule = freeGoodRuleLabel(freeGood);
  return (
    <div
      className="relative ml-3 rounded-lg border border-violet-200/80 bg-violet-50/80 py-2 pl-8 pr-3 dark:border-violet-800/50 dark:bg-violet-950/30"
      title={`${rule} — ได้แถมอัตโนมัติเมื่อสั่งสินค้าด้านบน ไม่ต้องเลือกสั่ง`}
    >
      <div
        className="pointer-events-none absolute bottom-1/2 left-3 top-[-6px] w-4"
        aria-hidden
      >
        <span className="absolute left-0 top-0 h-full w-px bg-violet-400 dark:bg-violet-500" />
        <span className="absolute left-0 top-full h-px w-3 -translate-y-px bg-violet-400 dark:bg-violet-500" />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CornerDownRight
              className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-400"
              aria-hidden
            />
            <span className="inline-flex shrink-0 items-center rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-500/30">
              แถม
            </span>
            <span className="truncate text-xs font-semibold text-violet-900 dark:text-violet-100">
              {freeGood.premiumProduct}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-400">
            {freeGood.premiumName}
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
            โปร: {rule}
            <span className="font-normal text-slate-400">
              {" "}
              · ได้แถมอัตโนมัติ
            </span>
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          ×{freeGood.qty} {freeGood.unitLabel}
        </span>
      </div>
    </div>
  );
}

function FreeGoodConnectorRail({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 left-[11px] flex w-4 flex-col",
        className
      )}
      aria-hidden
    >
      <span className="mx-auto w-px flex-1 bg-violet-400 dark:bg-violet-500" />
      <span className="h-px w-3 self-center bg-violet-400 dark:bg-violet-500" />
    </div>
  );
}

function FreeGoodIdentity({
  freeGood,
  rule,
}: {
  freeGood: FreeGoodDisplay;
  rule: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5 pl-0.5">
      <CornerDownRight
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-400"
        aria-hidden
      />
      <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-500/30">
        แถม
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-violet-900 dark:text-violet-100">
          {freeGood.premiumProduct}
        </div>
        <div className="truncate text-[11px] text-slate-600 dark:text-slate-400">
          {freeGood.premiumName}
        </div>
        <div className="mt-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
          โปร: {rule}
        </div>
      </div>
    </div>
  );
}

function FreeGoodQty({
  freeGood,
  align = "center",
}: {
  freeGood: FreeGoodDisplay;
  align?: "center" | "end";
}) {
  return (
    <span
      className={cn(
        "inline-flex text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400",
        align === "end" && "justify-end"
      )}
    >
      ×{freeGood.qty}
      <span className="ml-0.5 text-[10px] font-semibold">
        {freeGood.unitLabel}
      </span>
    </span>
  );
}

function FreeGoodRuleInline({ rule }: { rule: string }) {
  return (
    <>
      <span className="font-medium text-violet-700 dark:text-violet-300">
        {rule}
      </span>
      <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
      ได้แถมอัตโนมัติ
    </>
  );
}
