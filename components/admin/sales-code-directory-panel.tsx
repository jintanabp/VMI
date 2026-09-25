"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, UserPlus, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { appPath } from "@/lib/paths";
import { apiFetch } from "@/lib/api-fetch";
import { friendlyError } from "@/lib/error-message";
import { cn } from "@/lib/utils";

interface CodeRow {
  code: string;
  name: string;
  masterEmail: string | null;
  manual: { id: string; email: string }[];
  vdas: string[];
}

interface DirectoryResponse {
  loaded: { salesmanMaster: boolean; vdaAosBill: boolean };
  codes: CodeRow[];
}

type Scope = "with_vda" | "no_email" | "all";
type View = "code" | "vda";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** แยกอีเมลที่พิมพ์/วางมา — คั่นด้วยจุลภาค เว้นวรรค หรือขึ้นบรรทัดใหม่ก็ได้ */
function parseEmails(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function hasEmail(r: CodeRow) {
  return r.masterEmail != null || r.manual.length > 0;
}

/**
 * รหัสเซลล์ ↔ อีเมล ↔ VDA ในตารางเดียว (เดิมแยกเป็นกล่อง "กำหนดอีเมล" กับ "เซลล์ ↔ VDA"
 * ต้องดูสลับกันไปมา) — หนึ่งแถวต่อรหัส แก้อีเมลอ้างอิงได้ในแถวนั้นเลย
 *
 * อีเมลอ้างอิงที่แอดมินกำหนด = ใช้ login ในฐานะรหัสนั้นได้ (แม้รหัสไม่อยู่ใน cross_salesman)
 * และทับการจับคู่อัตโนมัติของอีเมลนั้น · อีเมลจาก cross_salesman แสดงไว้ให้เห็นแต่แก้ที่นี่ไม่ได้
 */
export function SalesCodeDirectoryPanel() {
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("with_vda");
  const [view, setView] = useState<View>("code");
  const [busy, setBusy] = useState(false);

  // ฟอร์มเพิ่มด้านบน (รหัสใหม่ที่ยังไม่มีในตาราง หรือใส่หลายอีเมลทีเดียว)
  const [newCode, setNewCode] = useState("");
  const [newEmails, setNewEmails] = useState("");
  // เพิ่มในแถว
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [rowEmails, setRowEmails] = useState("");
  const rowInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch(appPath("/api/admin/vda-sales"), { cache: "no-store" });
      if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);
      setData((await res.json()) as DirectoryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (addingTo) rowInput.current?.focus();
  }, [addingTo]);

  async function addEmails(code: string, emails: string[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(appPath("/api/admin/salesman-assignments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesmanCode: code, emails }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(friendlyError(body?.error, `เพิ่มไม่สำเร็จ (${res.status})`));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeEmail(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        appPath(`/api/admin/salesman-assignments?id=${encodeURIComponent(id)}`),
        { method: "DELETE" }
      );
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(friendlyError(body?.error, `ลบไม่สำเร็จ (${res.status})`));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => data?.codes ?? [], [data]);
  const counts = useMemo(
    () => ({
      with_vda: rows.filter((r) => r.vdas.length > 0).length,
      no_email: rows.filter((r) => r.vdas.length > 0 && !hasEmail(r)).length,
      all: rows.length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) =>
        scope === "all"
          ? true
          : scope === "with_vda"
            ? r.vdas.length > 0
            : r.vdas.length > 0 && !hasEmail(r)
      )
      .filter(
        (r) =>
          !q ||
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.masterEmail ?? "").includes(q) ||
          r.manual.some((m) => m.email.includes(q)) ||
          r.vdas.some((v) => v.includes(q))
      );
  }, [rows, scope, query]);

  /** มุมมองตาม VDA — กลับด้านจากแถวรหัส */
  const byVda = useMemo(() => {
    const map = new Map<string, CodeRow[]>();
    for (const r of filtered) {
      for (const v of r.vdas) map.set(v, [...(map.get(v) ?? []), r]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [filtered]);

  const parsedNew = parseEmails(newEmails);
  const badNew = parsedNew.filter((e) => !EMAIL_RE.test(e));
  const canAddNew = !busy && newCode.trim() && parsedNew.length > 0 && badNew.length === 0;

  const parsedRow = parseEmails(rowEmails);
  const badRow = parsedRow.filter((e) => !EMAIL_RE.test(e));

  // ฟังก์ชันธรรมดา ไม่ใช่คอมโพเนนต์ — ถ้าประกาศเป็นคอมโพเนนต์ในนี้ ทุกครั้งที่พิมพ์ช่องอีเมล
  // จะถูก mount ใหม่ เคอร์เซอร์หลุดทุกตัวอักษร
  function renderEmailCell(r: CodeRow) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {r.masterEmail && !r.manual.some((m) => m.email === r.masterEmail) && (
          <span
            className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            title="จากไฟล์ cross_salesman — จับคู่อัตโนมัติ แก้ที่นี่ไม่ได้"
          >
            {r.masterEmail}
            <span className="ml-1 text-[10px] text-slate-400">อัตโนมัติ</span>
          </span>
        )}
        {r.manual.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full bg-teal-50 py-0.5 pr-1 pl-2.5 text-xs text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800"
            title="อีเมลอ้างอิงที่แอดมินกำหนด"
          >
            {m.email}
            <button
              type="button"
              onClick={() => void removeEmail(m.id)}
              disabled={busy}
              className="rounded-full p-0.5 text-teal-500 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
              aria-label={`เอา ${m.email} ออกจาก ${r.code}`}
              title="เอาอีเมลนี้ออก (มีผลทันที)"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!hasEmail(r) && addingTo !== r.code && (
          <span className="text-xs text-slate-400">ยังไม่กำหนดอีเมล</span>
        )}
        {addingTo === r.code ? (
          <form
            className="flex items-center gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (parsedRow.length === 0 || badRow.length > 0) return;
              if (await addEmails(r.code, parsedRow)) {
                setAddingTo(null);
                setRowEmails("");
              }
            }}
          >
            <Input
              ref={rowInput}
              value={rowEmails}
              onChange={(e) => setRowEmails(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAddingTo(null);
                  setRowEmails("");
                }
              }}
              placeholder="อีเมล (หลายอันคั่นด้วย ,)"
              className={cn("h-7 w-60 text-xs", badRow.length > 0 && "border-red-400")}
            />
            <Button
              type="submit"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={busy || parsedRow.length === 0 || badRow.length > 0}
            >
              เพิ่ม
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setAddingTo(null);
                setRowEmails("");
              }}
            >
              ยกเลิก
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAddingTo(r.code);
              setRowEmails("");
            }}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-teal-400 hover:text-teal-700 dark:border-slate-600"
          >
            <Plus className="h-3 w-3" />
            อีเมล
          </button>
        )}
      </div>
    );
  }

  const renderVdaChips = (vdas: string[]) =>
    vdas.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {vdas.map((v) => (
          <span
            key={v}
            className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
          >
            {v.toUpperCase()}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-xs text-slate-400">ยังไม่ดูแลคลังใด</span>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">รหัสเซลล์ · อีเมล · VDA</CardTitle>
        <CardDescription>
          หนึ่งแถวต่อรหัสเซลล์ · อีเมลสีเขียว = อีเมลอ้างอิงที่แอดมินกำหนด ใช้เข้าสู่ระบบในฐานะรหัสนั้นได้
          (แม้รหัสไม่อยู่ใน cross_salesman) มีผลทันที · อีเมลสีเทา = จับคู่อัตโนมัติจาก cross_salesman
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* เพิ่มรหัสที่ยังไม่อยู่ในตาราง หรือใส่หลายอีเมลทีเดียว */}
        <form
          className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end dark:border-slate-700"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canAddNew) return;
            if (await addEmails(newCode.trim().toUpperCase(), parsedNew)) {
              setNewCode("");
              setNewEmails("");
            }
          }}
        >
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            รหัสเซลล์
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="S091"
              className="mt-1 h-9 font-mono"
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            อีเมลอ้างอิง (หลายอีเมลคั่นด้วยจุลภาค)
            <Input
              value={newEmails}
              onChange={(e) => setNewEmails(e.target.value)}
              placeholder="name@sahapat.co.th, assistant@sahapat.co.th"
              className={cn("mt-1 h-9", badNew.length > 0 && "border-red-400")}
            />
          </label>
          <Button type="submit" className="h-9" disabled={!canAddNew}>
            <UserPlus className="h-4 w-4" />
            กำหนดอีเมล
          </Button>
          {badNew.length > 0 && (
            <p className="text-xs text-red-600 sm:col-span-3 dark:text-red-400">
              รูปแบบอีเมลไม่ถูกต้อง: {badNew.join(", ")}
            </p>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อ / อีเมล / VDA..."
              className="h-9 pl-9"
            />
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800/60">
            {(
              [
                ["with_vda", `มี VDA (${counts.with_vda})`],
                ["no_email", `ยังไม่มีอีเมล (${counts.no_email})`],
                ["all", `ทั้งหมด (${counts.all})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setScope(k)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors",
                  scope === k
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800/60">
            {(
              [
                ["code", "ตามรหัส"],
                ["vda", "ตาม VDA"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors",
                  view === k
                    ? "bg-[#0f4c75] text-white dark:bg-[#1a6b9a]"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {data && (
            <span className="ml-auto text-[11px] text-slate-400">
              cross_salesman {data.loaded.salesmanMaster ? "✓" : "—"} · ทะเบียน VDA{" "}
              {data.loaded.vdaAosBill ? "✓" : "—"}
            </span>
          )}
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">กำลังโหลด...</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">ไม่มีรหัสที่ตรงกับตัวกรอง</p>
        ) : view === "code" ? (
          <div className="vmi-table-wrap">
            <div className="vmi-table-scroll max-h-[640px]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2.5 whitespace-nowrap">รหัสเซลล์</th>
                    <th className="px-3 py-2.5">อีเมลที่เข้าใช้งานได้</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">VDA ที่ดูแล</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.code}
                      className="border-t border-slate-100 align-top dark:border-slate-700/60"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                          {r.code}
                        </span>
                        {r.name && (
                          <p className="mt-0.5 text-xs text-slate-500">{r.name}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {renderEmailCell(r)}
                      </td>
                      <td className="px-3 py-2.5">
                        {renderVdaChips(r.vdas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="vmi-table-wrap">
            <div className="vmi-table-scroll max-h-[640px]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2.5 whitespace-nowrap">VDA</th>
                    <th className="px-3 py-2.5">รหัสเซลล์ · อีเมล</th>
                  </tr>
                </thead>
                <tbody>
                  {byVda.map(([vda, codeRows]) => (
                    <tr
                      key={vda}
                      className="border-t border-slate-100 align-top dark:border-slate-700/60"
                    >
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                          {vda.toUpperCase()}
                        </span>
                      </td>
                      <td className="space-y-2 px-3 py-2.5">
                        {codeRows.map((r) => (
                          <div key={r.code} className="flex flex-wrap items-start gap-2">
                            <span className="w-20 shrink-0 font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                              {r.code}
                            </span>
                            <div className="min-w-0 flex-1">
                              {renderEmailCell(r)}
                            </div>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
