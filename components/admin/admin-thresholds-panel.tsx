"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Save, Search, Trash2 } from "lucide-react";
import { appPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DEFAULT_MAX_DAYS,
  DEFAULT_MIN_DAYS,
} from "@/lib/stock/threshold-defaults";
import { cn } from "@/lib/utils";

interface GroupThreshold {
  section: string;
  minDays: number;
  maxDays: number;
}

interface BlockRow {
  skuId: string;
  skuCode: string;
  skuName: string;
  reason: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
}

interface StoreAccountRow {
  email: string;
  vdaCode: string;
  status: string;
  canManageMinMax: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

/**
 * หน้าจัดการ MIN/MAX + รายการหยุดสั่ง ฝั่งแอดมิน
 *
 * เดิมสองเรื่องนี้อยู่แต่ในหน้าร้านค้า (/manage) แอดมินต้อง impersonate ร้านเท่านั้น
 * ทั้งที่ manage-client บอกผู้ใช้ว่า "ติดต่อแอดมิน" — เป็นทางตันที่ไม่มีปลายทาง
 */
export function AdminThresholdsPanel() {
  const [vdaOptions, setVdaOptions] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<StoreAccountRow[]>([]);
  const [storeCode, setStoreCode] = useState("");
  const [groups, setGroups] = useState<GroupThreshold[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [draft, setDraft] = useState<Record<string, { min: string; max: string }>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    fetch(appPath("/api/vda"))
      .then((r) => r.json())
      .then((d: { sources?: string[] }) => {
        const list = Array.isArray(d.sources) ? d.sources : [];
        setVdaOptions(list);
        setStoreCode((prev) => prev || list[0] || "");
      })
      .catch(() => setVdaOptions([]));

    fetch(appPath("/api/admin/store-accounts"))
      .then((r) => r.json())
      .then((d: { accounts?: StoreAccountRow[] }) =>
        setAccounts(Array.isArray(d.accounts) ? d.accounts : [])
      )
      .catch(() => setAccounts([]));
  }, []);

  const load = useCallback(async (code: string) => {
    if (!code) return;
    setLoading(true);
    setMsg(null);
    try {
      const qs = `?storeCode=${encodeURIComponent(code)}`;
      const [tRes, bRes] = await Promise.all([
        fetch(appPath(`/api/admin/store-thresholds${qs}`), { cache: "no-store" }),
        fetch(appPath(`/api/admin/store-blocklist${qs}`), { cache: "no-store" }),
      ]);
      if (!tRes.ok) throw new Error(`โหลด MIN/MAX ไม่สำเร็จ (${tRes.status})`);
      if (!bRes.ok) throw new Error(`โหลดรายการหยุดสั่งไม่สำเร็จ (${bRes.status})`);
      const t = (await tRes.json()) as { groups?: GroupThreshold[] };
      const b = (await bRes.json()) as { blocks?: BlockRow[] };
      const rows = Array.isArray(t.groups) ? t.groups : [];
      setGroups(rows);
      setBlocks(Array.isArray(b.blocks) ? b.blocks : []);
      setDraft(
        Object.fromEntries(
          rows.map((g) => [
            g.section,
            { min: String(g.minDays), max: String(g.maxDays) },
          ])
        )
      );
    } catch (err) {
      setMsg({
        tone: "error",
        text: err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(storeCode);
  }, [storeCode, load]);

  const accountsForStore = useMemo(
    () => accounts.filter((a) => a.vdaCode === storeCode),
    [accounts, storeCode]
  );

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.section.toLowerCase().includes(q));
  }, [groups, search]);

  async function saveSection(section: string) {
    const d = draft[section];
    if (!d) return;
    const minDays = Number(d.min);
    const maxDays = Number(d.max);
    if (!Number.isFinite(minDays) || !Number.isFinite(maxDays)) {
      setMsg({ tone: "error", text: "MIN/MAX ต้องเป็นตัวเลข" });
      return;
    }
    if (maxDays < minDays) {
      setMsg({ tone: "error", text: "MAX ต้องไม่น้อยกว่า MIN" });
      return;
    }
    setBusy(section);
    setMsg(null);
    try {
      const res = await fetch(
        appPath(
          `/api/admin/store-thresholds?storeCode=${encodeURIComponent(storeCode)}`
        ),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, minDays, maxDays }),
        }
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? `บันทึกไม่สำเร็จ (${res.status})`);
      setMsg({ tone: "ok", text: `บันทึก ${section} แล้ว` });
      await load(storeCode);
    } catch (err) {
      setMsg({
        tone: "error",
        text: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ",
      });
    } finally {
      setBusy(null);
    }
  }

  async function applyToAllVdas(section: string) {
    const d = draft[section];
    if (!d) return;
    setBusy(`all:${section}`);
    setMsg(null);
    const failed: string[] = [];
    for (const code of vdaOptions) {
      const res = await fetch(
        appPath(`/api/admin/store-thresholds?storeCode=${encodeURIComponent(code)}`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section,
            minDays: Number(d.min),
            maxDays: Number(d.max),
          }),
        }
      ).catch(() => null);
      if (!res || !res.ok) failed.push(code);
    }
    setBusy(null);
    setMsg(
      failed.length === 0
        ? { tone: "ok", text: `ใช้ ${section} กับทุกคลัง (${vdaOptions.length}) แล้ว` }
        : { tone: "error", text: `ล้มเหลวที่: ${failed.join(", ")}` }
    );
  }

  async function unblock(skuId: string) {
    setBusy(skuId);
    setMsg(null);
    try {
      const res = await fetch(
        appPath(
          `/api/admin/store-blocklist?storeCode=${encodeURIComponent(storeCode)}`
        ),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skuIds: [skuId] }),
        }
      );
      if (!res.ok) throw new Error(`ปลดล็อกไม่สำเร็จ (${res.status})`);
      await load(storeCode);
    } catch (err) {
      setMsg({
        tone: "error",
        text: err instanceof Error ? err.message : "ปลดล็อกไม่สำเร็จ",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            msg.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          )}
        >
          {msg.text}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">เลือกคลัง</CardTitle>
          <CardDescription>
            ค่า MIN/MAX และรายการหยุดสั่งแยกตามคลัง
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {vdaOptions.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setStoreCode(v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  storeCode === v
                    ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                {v.toUpperCase()}
              </button>
            ))}
            {vdaOptions.length === 0 && (
              <p className="text-sm text-slate-500">ยังไม่มีคลังในระบบ</p>
            )}
          </div>
          {accountsForStore.length > 0 && (
            <p className="text-xs text-slate-500">
              บัญชีที่ผูกกับคลังนี้:{" "}
              {accountsForStore
                .map(
                  (a) =>
                    `${a.email}${a.canManageMinMax ? " (แก้ MIN/MAX ได้)" : ""}`
                )
                .join(" · ")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            MIN/MAX ตามกลุ่มสินค้า ({groups.length})
          </CardTitle>
          <CardDescription>
            กลุ่มที่ไม่ได้ตั้งค่าจะใช้ค่าเริ่มต้น {DEFAULT_MIN_DAYS}/
            {DEFAULT_MAX_DAYS} วัน
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหากลุ่มสินค้า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
          {!loading && groups.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              คลังนี้ยังไม่ได้ตั้งค่ารายกลุ่ม — ใช้ค่าเริ่มต้นทั้งหมด
              <br />
              <span className="text-xs">
                ตั้งค่ารายกลุ่มได้จากหน้า /manage ของร้าน หรือเปิดมุมมอง VDA
              </span>
            </p>
          )}

          <div className="space-y-2">
            {visibleGroups.map((g) => {
              const d = draft[g.section] ?? {
                min: String(g.minDays),
                max: String(g.maxDays),
              };
              const dirty =
                Number(d.min) !== g.minDays || Number(d.max) !== g.maxDays;
              return (
                // ชื่อกลุ่มบรรทัดบน ช่องกรอก+ปุ่มเป็นก้อนเดียว — เดิมทุกอย่างอยู่
                // flex-wrap ระดับเดียวกัน ชื่อกลุ่มยาวสั้นไม่เท่ากันเลยตัดบรรทัดคนละแบบ
                <div
                  key={g.section}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-900"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800 sm:flex-1 dark:text-slate-200">
                    {g.section}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      MIN
                      <Input
                        className="h-8 w-16 text-center"
                        inputMode="numeric"
                        value={d.min}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [g.section]: { ...d, min: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      MAX
                      <Input
                        className="h-8 w-16 text-center"
                        inputMode="numeric"
                        value={d.max}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [g.section]: { ...d, max: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <Button
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={!dirty}
                      pending={busy === g.section}
                      onClick={() => void saveSection(g.section)}
                    >
                      <Save className="h-3.5 w-3.5" />
                      บันทึก
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      pending={busy === `all:${g.section}`}
                      title="ใช้ค่านี้กับทุกคลัง VDA"
                      onClick={() => void applyToAllVdas(g.section)}
                    >
                      ทุกคลัง
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ban className="h-4 w-4 text-red-600 dark:text-red-400" />
            รายการหยุดสั่ง ({blocks.length})
          </CardTitle>
          <CardDescription>
            สินค้าที่ระบบจะไม่แนะนำให้สั่ง — &quot;ถึงวันที่&quot; ว่างคือหยุดถาวร
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              คลังนี้ไม่มีสินค้าที่หยุดสั่ง
            </p>
          ) : (
            <div className="space-y-2">
              {blocks.map((b) => (
                <div
                  key={b.skuId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                      <span className="font-mono text-teal-700 dark:text-teal-400">
                        {b.skuCode}
                      </span>{" "}
                      · {b.skuName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {b.reason} · {fmtDate(b.effectiveFrom)} →{" "}
                      {b.effectiveTo ? fmtDate(b.effectiveTo) : "ถาวร"}
                      {b.createdBy ? ` · โดย ${b.createdBy}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 px-2 text-xs"
                    pending={busy === b.skuId}
                    onClick={() => void unblock(b.skuId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    ปลดล็อก
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
