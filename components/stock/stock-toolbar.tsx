"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  CalendarOff,
  PackageX,
  Star,
  Check,
  Download,
  Eye,
  EyeOff,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  RotateCcw,
  Search,
  Sparkles,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { AnchoredPanel, PanelHeader } from "@/components/ui/anchored-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  countActiveFilters,
  DEFAULT_STOCK_FILTERS,
  type StockFilterState,
  type StockView,
} from "@/lib/stock/filters";
import {
  isFixedOrderSort,
  STOCK_SORT_OPTIONS,
  type StockSortState,
} from "@/lib/stock/sort";
import type { StockBrowseMode } from "@/lib/stock/browse-mode";

export interface StockViewCounts {
  all: number;
  needs: number;
  critical: number;
  new: number;
  noSales: number;
  deadStock: number;
  target: number;
}

type Tone = "slate" | "amber" | "red" | "sky" | "violet" | "emerald";

/** ตัวเลขบนป้ายแท็บ — ย่อหลักพันเพื่อไม่ให้แท็บยืดจนแถวล้น */
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

const VIEW_TABS: {
  view: StockView;
  label: string;
  shortLabel: string;
  icon: ReactNode;
  tone: Tone;
  hint: string;
  /** ซ่อนแท็บเมื่อไม่มีรายการเลย (ทั้งหมดแสดงเสมอ) */
  hideWhenEmpty: boolean;
}[] = [
  {
    view: "all",
    label: "ทั้งหมด",
    shortLabel: "ทั้งหมด",
    icon: <LayoutGrid className="h-3.5 w-3.5" />,
    tone: "slate",
    hint: "แสดงสินค้าทุกรายการในคลัง",
    hideWhenEmpty: false,
  },
  {
    view: "needs",
    label: "ควรสั่ง",
    shortLabel: "ควรสั่ง",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    tone: "amber",
    hint: "สต็อกต่ำกว่าเกณฑ์ — ระบบแนะนำให้สั่งเพิ่ม",
    hideWhenEmpty: false,
  },
  {
    view: "critical",
    label: "สต็อกวิกฤต",
    shortLabel: "วิกฤต",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    tone: "red",
    hint: "จะหมดก่อนถึงจำนวนวันขั้นต่ำ (CVD < MIN)",
    hideWhenEmpty: true,
  },
  {
    view: "new",
    label: "สินค้าใหม่",
    shortLabel: "ใหม่",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    tone: "sky",
    hint: "สินค้าที่เพิ่งเข้าระบบ",
    hideWhenEmpty: true,
  },
  {
    view: "noSales",
    label: "ไม่ขาย 1 เดือน",
    shortLabel: "ไม่ขาย",
    icon: <CalendarOff className="h-3.5 w-3.5" />,
    tone: "slate",
    hint: "ไม่มียอดขายเลยใน 30 วันล่าสุด — ควรพิจารณาหยุดสั่ง",
    hideWhenEmpty: true,
  },
  {
    view: "target",
    label: "ควรมีขาย",
    shortLabel: "ควรมี",
    icon: <Star className="h-3.5 w-3.5" />,
    tone: "emerald",
    hint: "อยู่ในเป้าขายเดือนนี้ของเซลล์ที่ดูแลคลังนี้ แต่ยังไม่มีในคลัง — สั่งเพิ่มได้เลย",
    hideWhenEmpty: true,
  },
  {
    view: "deadStock",
    label: "ค้างสต็อก",
    shortLabel: "ค้าง",
    icon: <PackageX className="h-3.5 w-3.5" />,
    tone: "violet",
    hint: "ไม่มียอดขายใน 30 วัน แต่ของยังค้างอยู่ในคลัง — เงินจมจริง ต้องเร่งระบาย ไม่ใช่แค่หยุดสั่ง",
    hideWhenEmpty: true,
  },
];

const TAB_ACTIVE: Record<Tone, string> = {
  slate:
    "bg-slate-700 text-white shadow-sm dark:bg-slate-200 dark:text-slate-900",
  amber: "bg-amber-500 text-white shadow-sm dark:bg-amber-500",
  red: "bg-red-600 text-white shadow-sm dark:bg-red-600",
  sky: "bg-sky-600 text-white shadow-sm dark:bg-sky-600",
  violet: "bg-violet-600 text-white shadow-sm dark:bg-violet-600",
  emerald: "bg-emerald-600 text-white shadow-sm dark:bg-emerald-600",
};

const TAB_BADGE_IDLE: Record<Tone, string> = {
  slate: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};

/* ------------------------------------------------------------------ */
/* View tabs                                                           */
/* ------------------------------------------------------------------ */

/**
 * สลับมุมมอง รายการ ↔ โปรโมชั่น
 *
 * ไม่ทำเป็นแท็บที่ 6 ใน VIEW_TABS เพราะ VIEW_TABS map 1:1 กับ StockView ซึ่งเป็น
 * query param ของ /api/stock/export — เพิ่มค่าปลอมเข้าไปจะทำให้จอกับไฟล์ไม่ตรงกัน
 */
function BrowseModeToggle({
  mode,
  onChange,
}: {
  mode: StockBrowseMode;
  onChange: (mode: StockBrowseMode) => void;
}) {
  const opts: { value: StockBrowseMode; label: string; icon: ReactNode; hint: string }[] =
    [
      {
        value: "list",
        label: "รายการ",
        icon: <LayoutList className="h-3.5 w-3.5" />,
        hint: "ตารางสินค้าแบบเต็ม พร้อม CVD และ MIN/MAX",
      },
      {
        value: "promo",
        label: "โปรโมชั่น",
        icon: <Tag className="h-3.5 w-3.5" />,
        hint: "จัดกลุ่มตามโปรโมชั่น เน้นรายละเอียดโปร ไม่แสดง CVD",
      },
    ];

  return (
    <div
      role="group"
      aria-label="รูปแบบการดู"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800/70"
    >
      {opts.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors lg:text-xs",
              active
                ? TAB_ACTIVE.slate
                : "text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
            )}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ViewTabs({
  view,
  counts,
  onChange,
  hiddenViews,
}: {
  view: StockView;
  counts: StockViewCounts;
  onChange: (view: StockView) => void;
  hiddenViews?: StockView[];
}) {
  const tabs = VIEW_TABS.filter(
    (t) =>
      !hiddenViews?.includes(t.view) &&
      (!t.hideWhenEmpty || counts[t.view] > 0 || view === t.view)
  );

  return (
    <div
      role="tablist"
      aria-label="มุมมองสินค้า"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800/70"
    >
      {tabs.map((t) => {
        const active = view === t.view;
        const count = counts[t.view];
        return (
          <button
            key={t.view}
            type="button"
            role="tab"
            aria-selected={active}
            title={t.hint}
            onClick={() => onChange(t.view)}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors lg:px-2.5 lg:text-xs",
              active
                ? TAB_ACTIVE[t.tone]
                : "text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
            )}
          >
            <span className={cn(active ? "opacity-90" : "opacity-60")}>
              {t.icon}
            </span>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
            <span
              className={cn(
                "ml-0.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4 tabular-nums",
                active ? "bg-white/25 text-white" : TAB_BADGE_IDLE[t.tone]
              )}
            >
              {compactCount(count)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filter panel                                                        */
/* ------------------------------------------------------------------ */

function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
        selected
          ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected
            ? "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500"
            : "border-slate-300 dark:border-slate-600"
        )}
      >
        {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

/** รายการตัวเลือกพร้อมช่องค้นหา — โผล่เมื่อรายการยาวจนไถหายาก */
function OptionPicker({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [q, setQ] = useState("");
  const searchable = options.length > 8;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.toLowerCase().includes(term));
  }, [options, q]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </p>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ล้าง
          </button>
        )}
      </div>
      {searchable && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`ค้นหา${title}...`}
          className="mb-1 h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      )}
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-xl bg-slate-50/80 p-1 dark:bg-slate-900/40">
        <OptionRow
          label="ทั้งหมด"
          selected={!value}
          onClick={() => onChange(null)}
        />
        {shown.map((opt) => (
          <OptionRow
            key={opt}
            label={opt}
            selected={value === opt}
            onClick={() => onChange(value === opt ? null : opt)}
          />
        ))}
        {shown.length === 0 && (
          <p className="px-2.5 py-3 text-center text-[11px] text-slate-400">
            ไม่พบ{title}ที่ตรงกับ &ldquo;{q.trim()}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

/** ปุ่มซ่อนสินค้าไม่ขาย 1 เดือน — งานหลักคือ "เอาของตายออกให้เหลือแต่ของที่ยังขาย"
 *  จึงอยู่บนทูลบาร์กดครั้งเดียวจบ ไม่ต้องเปิดเมนูกรอง */
function HideNoSalesToggle({
  active,
  count,
  disabled,
  onToggle,
}: {
  active: boolean;
  count: number;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={active}
      title={
        disabled
          ? "ปิดอยู่ เพราะกำลังดูมุมมอง “ไม่ขาย 1 เดือน”"
          : active
            ? `กำลังซ่อนสินค้าที่ไม่มียอดขายใน 30 วัน ${count} รายการ — กดเพื่อแสดงกลับ`
            : `เอาสินค้าที่ไม่มียอดขายใน 30 วัน ${count} รายการออก ให้เหลือแต่สินค้าที่ยังขายอยู่`
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-2 py-1 text-[11px] font-semibold transition-colors lg:px-2.5 lg:text-xs",
        disabled && "cursor-not-allowed opacity-40",
        active
          ? "border-teal-600 bg-teal-600 text-white shadow-sm dark:border-teal-500 dark:bg-teal-600"
          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
      )}
    >
      {active ? (
        <EyeOff className="h-3.5 w-3.5" />
      ) : (
        <Eye className="h-3.5 w-3.5 opacity-60" />
      )}
      <span className="hidden sm:inline">ซ่อนของไม่ขาย 1 เดือน</span>
      <span className="sm:hidden">ซ่อนไม่ขาย</span>
      <span
        className={cn(
          "inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-4 tabular-nums",
          active
            ? "bg-white/25 text-white"
            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
        )}
      >
        {compactCount(count)}
      </span>
    </button>
  );
}

function FilterMenu({
  filters,
  brands,
  sections,
  onChange,
  onClear,
}: {
  filters: StockFilterState;
  brands: string[];
  sections: string[];
  onChange: (next: StockFilterState) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const activeCount = countActiveFilters(filters);

  return (
    <div className="relative shrink-0" ref={anchorRef}>
      <Button
        variant={activeCount > 0 ? "default" : "outline"}
        size="sm"
        className="h-8 gap-1.5 px-2.5 lg:h-9"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="กรองตามแบรนด์ / กลุ่มสินค้า"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">กรอง</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-white/25 px-1.5 py-px text-[10px] font-bold tabular-nums">
            {activeCount}
          </span>
        )}
      </Button>

      <AnchoredPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        width={330}
        reflowKey={`${brands.length}-${sections.length}-${activeCount}`}
      >
        <PanelHeader title="ตัวกรอง" onClose={() => setOpen(false)} />

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
          {brands.length > 0 && (
            <OptionPicker
              title="แบรนด์"
              options={brands}
              value={filters.brand}
              onChange={(brand) => onChange({ ...filters, brand })}
            />
          )}

          {sections.length > 0 && (
            <OptionPicker
              title="กลุ่มสินค้า"
              options={sections}
              value={filters.section}
              onChange={(section) => onChange({ ...filters, section })}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            ล้างตัวกรอง
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0"
            onClick={() => setOpen(false)}
          >
            เสร็จสิ้น
          </Button>
        </div>
      </AnchoredPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sort menu                                                           */
/* ------------------------------------------------------------------ */

function SortMenu({
  sort,
  onChange,
}: {
  sort: StockSortState;
  onChange: (next: StockSortState) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const current = STOCK_SORT_OPTIONS.find((o) => o.key === sort.key);
  const fixed = isFixedOrderSort(sort.key);

  const groups = useMemo(() => {
    const map = new Map<string, typeof STOCK_SORT_OPTIONS>();
    for (const o of STOCK_SORT_OPTIONS) {
      const list = map.get(o.group) ?? [];
      list.push(o);
      map.set(o.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="relative shrink-0" ref={anchorRef}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5 lg:h-9"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`เรียงตาม ${current?.label ?? ""}`}
      >
        <ArrowDownUp className="h-3.5 w-3.5 text-slate-400" />
        <span className="hidden max-w-[7rem] truncate lg:inline">
          {current?.label ?? "เรียงลำดับ"}
        </span>
        {!fixed &&
          (sort.dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          ))}
      </Button>

      <AnchoredPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        width={270}
      >
        <PanelHeader title="เรียงลำดับ" onClose={() => setOpen(false)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {groups.map(([group, options]) => (
            <div key={group} className="mb-1.5 last:mb-0">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {group}
              </p>
              {options.map((o) => {
                const active = sort.key === o.key;
                const fixedOption = isFixedOrderSort(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      // กดคีย์เดิมซ้ำ = สลับทิศทาง, คีย์ใหม่ = เริ่มที่ทิศทางที่อ่านง่ายสุด
                      if (active && !fixedOption) {
                        onChange({
                          key: o.key,
                          dir: sort.dir === "asc" ? "desc" : "asc",
                        });
                        return;
                      }
                      onChange({
                        key: o.key,
                        dir: o.key === "code" ? "desc" : "asc",
                      });
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                      active
                        ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                    )}
                  >
                    <span className="min-w-0 truncate">{o.label}</span>
                    {active && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                        {fixedOption ? (
                          "ลำดับตายตัว"
                        ) : (
                          <>
                            {sort.dir === "asc" ? o.asc : o.desc}
                            {sort.dir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )}
                          </>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {!fixed && (
          <button
            type="button"
            onClick={() =>
              onChange({
                key: sort.key,
                dir: sort.dir === "asc" ? "desc" : "asc",
              })
            }
            className="flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60"
          >
            {sort.dir === "asc" ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
            สลับเป็น{sort.dir === "asc" ? current?.desc : current?.asc}
          </button>
        )}
      </AnchoredPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overflow menu                                                       */
/* ------------------------------------------------------------------ */

function MenuItem({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-slate-800/60"
    >
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-800 dark:text-slate-100">
          {label}
        </span>
        {hint && (
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

function MoreMenu({
  onExport,
  onResetQty,
  onClearSelection,
  selectedCount,
  adjustedCount,
}: {
  onExport: (scope: "all" | "selected") => void;
  onResetQty: () => void;
  onClearSelection: () => void;
  selectedCount: number;
  adjustedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const run = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  return (
    <div className="relative shrink-0" ref={anchorRef}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 px-0 lg:h-9 lg:w-9"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="เมนูเพิ่มเติม"
        title="เพิ่มเติม"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      <AnchoredPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        width={260}
      >
        <div className="p-1.5">
          <MenuItem
            icon={<Download className="h-4 w-4" />}
            label="ส่งออกฟอร์มสั่ง"
            hint="Excel ฟอร์มสั่งสินค้า + ชีตรายละเอียด — ตามตัวกรองและจำนวนที่ตั้งไว้บนจอ"
            onClick={() => run(() => onExport("all"))}
          />
          <MenuItem
            icon={<Download className="h-4 w-4" />}
            label={`ส่งออกเฉพาะที่เลือก (${selectedCount})`}
            hint="เฉพาะแถวที่ติ๊กไว้ พร้อมจำนวนที่ตั้งบนจอ"
            disabled={selectedCount === 0}
            onClick={() => run(() => onExport("selected"))}
          />
          <MenuItem
            icon={<RotateCcw className="h-4 w-4" />}
            label="ล้างจำนวนที่กรอกทั้งหมด"
            hint={
              adjustedCount > 0
                ? `กรอกไว้ ${adjustedCount} รายการ — ทุกช่องจะกลับเป็น 0`
                : "ยังไม่ได้กรอกจำนวนรายการใด"
            }
            disabled={adjustedCount === 0}
            onClick={() => run(onResetQty)}
          />
          <MenuItem
            icon={<X className="h-4 w-4" />}
            label="ล้างการเลือกทั้งหมด"
            hint={
              selectedCount > 0
                ? `เลือกอยู่ ${selectedCount} รายการ`
                : "ยังไม่ได้เลือกรายการใด"
            }
            disabled={selectedCount === 0}
            onClick={() => run(onClearSelection)}
          />
        </div>
      </AnchoredPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Active filter chips                                                 */
/* ------------------------------------------------------------------ */

function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-50 py-0.5 pl-2 pr-1 text-[11px] font-medium text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800/60">
      <span className="max-w-[9rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 hover:bg-teal-200/60 dark:hover:bg-teal-800/60"
        aria-label={`ล้าง ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

export function StockToolbar({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  counts,
  shownCount,
  brands,
  sections,
  sort,
  onSortChange,
  onExport,
  onResetQty,
  onClearSelection,
  selectedCount,
  adjustedCount,
  mode,
  onModeChange,
  hiddenViews,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  filters: StockFilterState;
  onFiltersChange: (next: StockFilterState) => void;
  counts: StockViewCounts;
  shownCount: number;
  brands: string[];
  sections: string[];
  sort: StockSortState;
  onSortChange: (next: StockSortState) => void;
  onExport: (scope: "all" | "selected") => void;
  onResetQty: () => void;
  onClearSelection: () => void;
  selectedCount: number;
  adjustedCount: number;
  mode: StockBrowseMode;
  onModeChange: (mode: StockBrowseMode) => void;
  /** แท็บที่ซ่อนในโหมดนี้ — เช่น "สต็อกวิกฤต" ซึ่งนิยามด้วย CVD ล้วน */
  hiddenViews?: StockView[];
}) {
  const filtering =
    countActiveFilters(filters) > 0 ||
    filters.view !== "all" ||
    filters.hideNoSales ||
    Boolean(search.trim());

  return (
    <div className="vmi-stock-toolbar shrink-0">
      {/* แถวบน: ค้นหา + ปุ่มควบคุม 3 ปุ่ม (กรอง / เรียง / เพิ่มเติม) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            className={cn("h-8 pl-9 text-xs lg:h-9 lg:text-sm", search && "pr-9")}
            placeholder="ค้นหาชื่อ / รหัส / บาร์โค้ด / แบรนด์..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="ล้างการค้นหา"
              title="ล้างการค้นหา"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <BrowseModeToggle mode={mode} onChange={onModeChange} />
        <FilterMenu
          filters={filters}
          brands={brands}
          sections={sections}
          onChange={onFiltersChange}
          onClear={() =>
            onFiltersChange({
              ...DEFAULT_STOCK_FILTERS,
              // แท็บมุมมองและปุ่มซ่อนของไม่ขายมีปุ่มของตัวเอง — ปุ่มนี้ล้างเฉพาะในเมนู
              view: filters.view,
              hideNoSales: filters.hideNoSales,
            })
          }
        />
        <SortMenu sort={sort} onChange={onSortChange} />
        <MoreMenu
          onExport={onExport}
          onResetQty={onResetQty}
          onClearSelection={onClearSelection}
          selectedCount={selectedCount}
          adjustedCount={adjustedCount}
        />
      </div>

      {/* แถวล่าง: แท็บมุมมอง + ป้ายตัวกรองที่เปิดอยู่ + จำนวนที่แสดง */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ViewTabs
            view={filters.view}
            counts={counts}
            hiddenViews={hiddenViews}
            onChange={(view) => onFiltersChange({ ...filters, view })}
          />
          <HideNoSalesToggle
            active={filters.hideNoSales}
            count={counts.noSales}
            disabled={filters.view === "noSales"}
            onToggle={() =>
              onFiltersChange({ ...filters, hideNoSales: !filters.hideNoSales })
            }
          />
          {filters.brand && (
            <ActiveChip
              label={`แบรนด์: ${filters.brand}`}
              onRemove={() => onFiltersChange({ ...filters, brand: null })}
            />
          )}
          {filters.section && (
            <ActiveChip
              label={`กลุ่ม: ${filters.section}`}
              onRemove={() => onFiltersChange({ ...filters, section: null })}
            />
          )}
        </div>

        <p className="hidden shrink-0 text-[11px] tabular-nums text-slate-400 sm:block dark:text-slate-500">
          {filtering ? (
            <>
              แสดง{" "}
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                {shownCount.toLocaleString("th-TH")}
              </span>{" "}
              จาก {counts.all.toLocaleString("th-TH")}
            </>
          ) : (
            <>{counts.all.toLocaleString("th-TH")} รายการ</>
          )}
        </p>
      </div>

    </div>
  );
}
