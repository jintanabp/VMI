"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Layers,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
  Lock,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { cn, matchesProductSearch } from "@/lib/utils";
import type { StockRowComputed } from "@/lib/repositories/types";

interface ManageClientProps {
  storeCode: string;
  storeName: string;
  storeAddress?: string;
  isVda?: boolean;
  email: string;
  canManage: boolean;
}

interface StockApiResponse {
  rows: StockRowComputed[];
}

interface GroupThreshold {
  section: string;
  minDays: number;
  maxDays: number;
}

const NO_SECTION = "(ไม่มี Section)";
const DEFAULT_MIN_DAYS = 7;
const DEFAULT_MAX_DAYS = 15;

export function ManageClient({
  storeCode,
  storeName,
  storeAddress,
  isVda,
  email,
  canManage,
}: ManageClientProps) {
  const [tab, setTab] = useState<"minmax" | "blocklist" | "account">("minmax");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resetMsg, setResetMsg] = useState("");
  const [resetting, setResetting] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const queryClient = useQueryClient();

  const stockQuery = useQuery<StockApiResponse>({
    queryKey: ["stock"],
    queryFn: () =>
      fetch("/api/stock", { cache: "no-store" }).then((r) => r.json()),
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const thresholdsQuery = useQuery<{ groups: GroupThreshold[] }>({
    queryKey: ["thresholds"],
    queryFn: () =>
      fetch("/api/store/thresholds", { cache: "no-store" }).then((r) =>
        r.json()
      ),
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const blocklistQuery = useQuery<{ blocks: unknown[] }>({
    queryKey: ["store-blocklist"],
    queryFn: () => fetch("/api/store/blocklist").then((r) => r.json()),
  });
  const blockCount = blocklistQuery.data?.blocks?.length ?? 0;

  const rows = useMemo(() => stockQuery.data?.rows ?? [], [stockQuery.data]);

  const savedGroups = useMemo(() => {
    const m = new Map<string, GroupThreshold>();
    for (const g of thresholdsQuery.data?.groups ?? []) m.set(g.section, g);
    return m;
  }, [thresholdsQuery.data]);

  const sections = useMemo(() => {
    const bySection = new Map<string, StockRowComputed[]>();
    for (const r of rows) {
      const key = r.section || NO_SECTION;
      const arr = bySection.get(key);
      if (arr) arr.push(r);
      else bySection.set(key, [r]);
    }
    return [...bySection.entries()]
      .map(([section, items]) => ({
        section,
        items,
        newCount: items.filter((i) => i.isNew).length,
      }))
      // section ที่มีสินค้าใหม่ลอยขึ้นบนสุด แล้วค่อยเรียงตามชื่อ
      .sort(
        (a, b) =>
          (b.newCount > 0 ? 1 : 0) - (a.newCount > 0 ? 1 : 0) ||
          a.section.localeCompare(b.section, "th")
      );
  }, [rows]);

  const totalNewCount = useMemo(
    () => rows.filter((r) => r.isNew).length,
    [rows]
  );

  const filteredSections = useMemo(
    () =>
      sections
        .map(({ section, items, newCount }) => {
          const q = brandSearch.trim();
          if (!q) return { section, items, newCount };
          const matchedItems = items.filter((item) =>
            matchesProductSearch(q, item)
          );
          const sectionHit = section.toLowerCase().includes(q.toLowerCase());
          // ชื่อแบรนด์ตรง → โชว์ทั้งกลุ่ม; ไม่ตรง → โชว์เฉพาะสินค้าที่ match
          if (sectionHit) return { section, items, newCount };
          if (matchedItems.length === 0) return null;
          return {
            section,
            items: matchedItems,
            newCount: matchedItems.filter((i) => i.isNew).length,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s != null),
    [sections, brandSearch]
  );

  // แบรนด์จริง (ตัด "ไม่มี Section") สำหรับตั้งค่าหลายแบรนด์พร้อมกัน
  const bulkSections = useMemo(
    () =>
      sections
        .filter((s) => s.section !== NO_SECTION)
        .map((s) => ({ section: s.section, count: s.items.length })),
    [sections]
  );

  function toggle(section: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  async function requestReset() {
    setResetting(true);
    setResetMsg("");
    try {
      const res = await fetch("/api/auth/store/request-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setResetMsg(data.message ?? "ส่งคำขอรีเซ็ตรหัสแล้ว");
    } finally {
      setResetting(false);
    }
  }

  const loading = stockQuery.isLoading || thresholdsQuery.isLoading;

  return (
    <PageShell className="pb-16">
      <AppHeader
        compact
        title="จัดการร้านค้า"
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist">
          {(
            [
              { id: "minmax", label: "ตั้ง MIN / MAX", icon: Settings2, badge: 0 },
              { id: "blocklist", label: "หยุดสั่ง", icon: Ban, badge: blockCount },
              { id: "account", label: "รหัสผ่าน", icon: KeyRound, badge: 0 },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-teal-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {t.badge > 0 && (
                  <span
                    className={cn(
                      "inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold",
                      active ? "bg-white text-teal-700" : "bg-red-500 text-white"
                    )}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "account" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <KeyRound className="h-4 w-4 text-teal-600" />
            รหัสผ่าน
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {email || storeCode}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={requestReset}
              disabled={resetting || !email}
            >
              {resetting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              ขอรีเซ็ตรหัสผ่าน
            </Button>
            {resetMsg && (
              <span className="text-xs text-teal-700 dark:text-teal-400">
                {resetMsg}
              </span>
            )}
          </div>
        </section>
        )}

        {tab === "minmax" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Settings2 className="h-4 w-4 text-teal-600" />
              ตั้งค่า MIN / MAX ตามแบรนด์
            </h2>
            {totalNewCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                <Sparkles className="h-3.5 w-3.5" />
                สินค้าใหม่ {totalNewCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            กำหนดจำนวนวันสำหรับสินค้าในกลุ่ม (ค่าเริ่มต้น MIN {DEFAULT_MIN_DAYS} / MAX{" "}
            {DEFAULT_MAX_DAYS} วัน)
            {canManage
              ? " — กดดูรายสินค้าเพื่อตั้งค่าพิเศษรายตัว"
              : " — บัญชีนี้ดูได้อย่างเดียว"}
          </p>

          {totalNewCount > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-200">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              มีสินค้าใหม่ {totalNewCount} รายการเข้ามาในระบบ — แบรนด์ที่มีสินค้าใหม่ถูกจัดขึ้นบนสุดแล้ว
            </div>
          )}

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={brandSearch}
              onChange={(e) => setBrandSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / รหัส / บาร์โค้ด / แบรนด์..."
              className={cn(
                "w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900",
                brandSearch ? "pr-9" : "pr-3"
              )}
            />
            {brandSearch ? (
              <button
                type="button"
                onClick={() => setBrandSearch("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="ล้างการค้นหา"
                title="ล้างการค้นหา"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {!canManage && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
              <Lock className="h-3.5 w-3.5" />
              บัญชีนี้ไม่มีสิทธิแก้ไข min/max (ติดต่อแอดมิน)
            </div>
          )}

          {canManage && bulkSections.length > 0 && (
            <BulkBrandThresholds
              sections={bulkSections}
              onDone={() => {
                void queryClient.invalidateQueries({ queryKey: ["thresholds"] });
                void queryClient.invalidateQueries({ queryKey: ["stock"] });
              }}
            />
          )}

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด...</p>
          ) : sections.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              ไม่พบข้อมูลสินค้า
            </p>
          ) : filteredSections.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              ไม่พบแบรนด์ที่ตรงกับคำค้นหา
            </p>
          ) : (
            <>
              <p className="mt-3 text-[11px] text-slate-400">
                {filteredSections.length} แบรนด์ — เลื่อนดูในกรอบนี้
              </p>
              <div className="mt-1 max-h-[55vh] space-y-2 overflow-y-auto rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                {filteredSections.map(({ section, items, newCount }) => (
                  <SectionCard
                    key={section}
                    section={section}
                    items={items}
                    newCount={newCount}
                    canManage={canManage}
                    saved={savedGroups.get(section)}
                    expanded={expanded.has(section)}
                    onToggle={() => toggle(section)}
                    onChanged={() => {
                      void queryClient.invalidateQueries({ queryKey: ["thresholds"] });
                      void queryClient.invalidateQueries({ queryKey: ["stock"] });
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </section>
        )}

        {tab === "blocklist" && <StoreBlocklistSection />}
      </main>
    </PageShell>
  );
}

interface BlockItem {
  skuId: string;
  skuCode: string;
  skuName: string;
  reason: string;
  effectiveFrom: string;
  createdAt: string;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StoreBlocklistSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ blocks: BlockItem[] }>({
    queryKey: ["store-blocklist"],
    queryFn: () => fetch("/api/store/blocklist").then((r) => r.json()),
  });
  const blocks = data?.blocks ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["store-blocklist"] });
    void qc.invalidateQueries({ queryKey: ["stock"] });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
        <Ban className="h-4 w-4 text-red-500" />
        รายการหยุดสั่ง
        {blocks.length > 0 && (
          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {blocks.length}
          </span>
        )}
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        สินค้าที่ร้านหยุดสั่ง — แก้เหตุผล/วันเริ่ม หรือยกเลิกได้ (แจ้งเซลล์อัตโนมัติ)
      </p>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-500">กำลังโหลด...</p>
      ) : blocks.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          ยังไม่มีสินค้าที่หยุดสั่ง
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {blocks.map((b) => (
            <BlockRow key={b.skuId} block={b} onChanged={refresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BlockRow({
  block,
  onChanged,
}: {
  block: BlockItem;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(block.reason);
  const [effective, setEffective] = useState(toDatetimeLocal(block.effectiveFrom));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReason(block.reason);
    setEffective(toDatetimeLocal(block.effectiveFrom));
  }, [block.reason, block.effectiveFrom]);

  async function save() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/store/blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuIds: [block.skuId],
          reason: reason.trim(),
          effectiveFrom: effective ? new Date(effective).toISOString() : undefined,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("ยกเลิกการหยุดสั่งสินค้านี้? ระบบจะกลับมาแนะนำสั่งตามปกติ")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/store/blocklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skuIds: [block.skuId] }),
      });
      if (res.ok) onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-slate-900 dark:text-slate-100">
          <span className="font-mono text-teal-700 dark:text-teal-400">
            {block.skuCode}
          </span>{" "}
          {block.skuName}
        </p>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={busy}
              title="แก้ไข"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              onClick={remove}
              disabled={busy}
              title="ยกเลิกหยุดสั่ง"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผล"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="datetime-local"
            value={effective}
            onChange={(e) => setEffective(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setReason(block.reason);
                setEffective(toDatetimeLocal(block.effectiveFrom));
              }}
              disabled={busy}
            >
              <X className="h-4 w-4" />
              ยกเลิก
            </Button>
            <Button size="sm" onClick={save} disabled={busy || !reason.trim()}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              บันทึก
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            เหตุผล: {block.reason}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            เริ่มหยุด{" "}
            {new Date(block.effectiveFrom).toLocaleDateString("th-TH", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            })}
          </p>
        </>
      )}
    </li>
  );
}

function BulkBrandThresholds({
  sections,
  onDone,
}: {
  sections: { section: string; count: number }[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [minDays, setMinDays] = useState(String(DEFAULT_MIN_DAYS));
  const [maxDays, setMaxDays] = useState(String(DEFAULT_MAX_DAYS));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => s.section.toLowerCase().includes(q));
  }, [sections, filter]);

  function toggle(section: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  const min = Number(minDays);
  const max = Number(maxDays);
  const invalid =
    !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min;
  const canApply = selected.size > 0 && !invalid && !saving;

  async function apply() {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/store/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: [...selected],
          minDays: min,
          maxDays: max,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setMsg(
        `ตั้งค่า ${data.count ?? selected.size} แบรนด์แล้ว (MIN ${min} / MAX ${max} วัน)`
      );
      setSelected(new Set());
      onDone();
      setTimeout(() => setMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/40 dark:border-teal-900/50 dark:bg-teal-950/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-teal-600" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-teal-600" />
        )}
        <Layers className="h-4 w-4 shrink-0 text-teal-600" />
        <span className="text-sm font-semibold text-teal-800 dark:text-teal-200">
          ตั้งค่าหลายแบรนด์พร้อมกัน
        </span>
        {selected.size > 0 && (
          <span className="ml-auto rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
            เลือก {selected.size}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-teal-100 px-3 py-3 dark:border-teal-900/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              กำหนดจำนวนวัน
            </span>
            <LabeledDays label="MIN" value={minDays} onChange={setMinDays} />
            <LabeledDays label="MAX" value={maxDays} onChange={setMaxDays} />
            {invalid && (
              <span className="text-[11px] text-red-500">
                ค่าไม่ถูกต้อง (MAX ต้อง ≥ MIN)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="กรองแบรนด์..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const s of visible) next.add(s.section);
                  return next;
                })
              }
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-teal-900/40"
            >
              เลือกที่แสดง
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              ล้าง
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap gap-1.5">
              {visible.map((s) => {
                const on = selected.has(s.section);
                return (
                  <button
                    key={s.section}
                    type="button"
                    onClick={() => toggle(s.section)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                      on
                        ? "border-teal-500 bg-teal-500 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    )}
                  >
                    {on && <Check className="h-3 w-3 shrink-0" />}
                    <span className="max-w-[10rem] truncate">{s.section}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        on ? "text-teal-100" : "text-slate-400"
                      )}
                    >
                      ({s.count})
                    </span>
                  </button>
                );
              })}
              {visible.length === 0 && (
                <span className="px-1 py-2 text-xs text-slate-400">
                  ไม่พบแบรนด์
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={apply} disabled={!canApply}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              ตั้งค่า{selected.size > 0 ? ` ${selected.size} แบรนด์` : ""}
            </Button>
            {msg && (
              <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
                {msg}
              </span>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({
  section,
  items,
  newCount,
  canManage,
  saved,
  expanded,
  onToggle,
  onChanged,
}: {
  section: string;
  items: StockRowComputed[];
  newCount: number;
  canManage: boolean;
  saved?: GroupThreshold;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [minDays, setMinDays] = useState(String(saved?.minDays ?? DEFAULT_MIN_DAYS));
  const [maxDays, setMaxDays] = useState(String(saved?.maxDays ?? DEFAULT_MAX_DAYS));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [error, setError] = useState("");

  const brandLabel = useMemo(() => {
    const brands = [
      ...new Set(
        items.map((i) => i.brand?.trim()).filter((b): b is string => !!b)
      ),
    ];
    if (brands.length === 0) return null;
    if (brands.length === 1) return brands[0];
    return brands.slice(0, 3).join(", ") + (brands.length > 3 ? "…" : "");
  }, [items]);

  useEffect(() => {
    setMinDays(String(saved?.minDays ?? DEFAULT_MIN_DAYS));
    setMaxDays(String(saved?.maxDays ?? DEFAULT_MAX_DAYS));
  }, [saved?.minDays, saved?.maxDays]);

  const isDefault = !saved && section !== NO_SECTION;

  async function save() {
    setSaving(true);
    setError("");
    setSavedFlag(false);
    try {
      const res = await fetch("/api/store/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          minDays: Number(minDays),
          maxDays: Number(maxDays),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2000);
      // อัปเดตสินค้าย่อยในแบรนด์ให้สะท้อนค่ากลุ่มใหม่ทันที (แก้บั๊กค่าไม่เด้งตาม)
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (
      !confirm(
        `รีเซ็ต MIN / MAX ของ "${section}" กลับเป็นค่าเริ่มต้น (${DEFAULT_MIN_DAYS} / ${DEFAULT_MAX_DAYS} วัน)?`
      )
    ) {
      return;
    }
    setResetting(true);
    setError("");
    setSavedFlag(false);
    try {
      const res = await fetch("/api/store/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          reset: true,
          skuIds: items.map((i) => i.skuId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "รีเซ็ตไม่สำเร็จ");
        return;
      }
      setMinDays(String(DEFAULT_MIN_DAYS));
      setMaxDays(String(DEFAULT_MAX_DAYS));
      onChanged();
    } finally {
      setResetting(false);
    }
  }

  const canSaveGroup = canManage && section !== NO_SECTION;
  const canResetGroup =
    canSaveGroup &&
    (saved != null ||
      minDays !== String(DEFAULT_MIN_DAYS) ||
      maxDays !== String(DEFAULT_MAX_DAYS) ||
      items.some((i) => i.thresholdSource === "sku"));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          )}
          <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
            {section}
          </span>
          {brandLabel && brandLabel !== section && (
            <span className="shrink-0 text-[10px] text-slate-400">
              · {brandLabel}
            </span>
          )}
          <span className="shrink-0 text-xs text-slate-400">
            ({items.length})
          </span>
          {newCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              <Sparkles className="h-2.5 w-2.5" />
              ใหม่ {newCount}
            </span>
          )}
          {isDefault && (
            <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              ค่าเริ่มต้น
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5">
          <LabeledDays
            label="MIN"
            value={minDays}
            onChange={setMinDays}
            disabled={!canSaveGroup}
          />
          <LabeledDays
            label="MAX"
            value={maxDays}
            onChange={setMaxDays}
            disabled={!canSaveGroup}
          />
          {canSaveGroup && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={save}
                disabled={saving || resetting}
                title="บันทึก MIN / MAX"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : savedFlag ? (
                  "✓"
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={resetToDefault}
                disabled={resetting || saving || !canResetGroup}
                title="รีเซ็ตเป็นค่าเริ่มต้น"
              >
                {resetting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="bg-red-50 px-3 py-1 text-xs text-red-600 dark:bg-red-950/30">
          {error}
        </p>
      )}

      {expanded && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((row) => (
            <SkuOverrideRow
              key={row.skuId}
              row={row}
              canManage={canManage}
              onSaved={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkuOverrideRow({
  row,
  canManage,
  onSaved,
}: {
  row: StockRowComputed;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [minDays, setMinDays] = useState(String(row.minDays));
  const [maxDays, setMaxDays] = useState(String(row.maxDays));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);

  useEffect(() => {
    setMinDays(String(row.minDays));
    setMaxDays(String(row.maxDays));
  }, [row.minDays, row.maxDays]);

  async function save() {
    setSaving(true);
    setSavedFlag(false);
    try {
      const res = await fetch("/api/store/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: row.skuId,
          minDays: Number(minDays),
          maxDays: Number(maxDays),
        }),
      });
      if (res.ok) {
        setSavedFlag(true);
        setTimeout(() => setSavedFlag(false), 2000);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  async function resetSku() {
    setResetting(true);
    setSavedFlag(false);
    try {
      const res = await fetch("/api/store/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: row.skuId,
          minDays: DEFAULT_MIN_DAYS,
          maxDays: DEFAULT_MAX_DAYS,
        }),
      });
      if (res.ok) {
        setMinDays(String(DEFAULT_MIN_DAYS));
        setMaxDays(String(DEFAULT_MAX_DAYS));
        onSaved();
      }
    } finally {
      setResetting(false);
    }
  }

  const canResetSku = canManage && row.thresholdSource === "sku";

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
          {row.isNew && (
            <span className="mr-1 inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              <Sparkles className="h-2.5 w-2.5" />
              ใหม่
            </span>
          )}
          <span className="font-mono text-teal-700 dark:text-teal-400">
            {row.skuCode}
          </span>{" "}
          {row.skuName}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {row.barcode && (
            <p className="font-mono text-[10px] text-slate-400">{row.barcode}</p>
          )}
          {row.thresholdSource === "section" && (
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              ตามแบรนด์
            </span>
          )}
          {row.thresholdSource === "sku" && (
            <span className="rounded bg-teal-50 px-1 py-0.5 text-[9px] font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              แก้รายตัว
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <LabeledDays
          label="MIN"
          value={minDays}
          onChange={setMinDays}
          disabled={!canManage}
        />
        <LabeledDays
          label="MAX"
          value={maxDays}
          onChange={setMaxDays}
          disabled={!canManage}
        />
        {canManage && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={save}
              disabled={saving || resetting}
              title="บันทึก MIN / MAX รายตัว"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : savedFlag ? (
                "✓"
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetSku}
              disabled={resetting || saving || !canResetSku}
              title="ล้างค่าแก้รายตัว กลับไปใช้ตามแบรนด์"
            >
              {resetting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function LabeledDays({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg border border-slate-200 px-1.5 py-0.5 dark:border-slate-700",
        disabled && "opacity-60"
      )}
    >
      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className="w-10 bg-transparent text-right text-xs tabular-nums outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
