"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
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

interface AssignmentRow {
  id: string;
  email: string;
  salesmanCode: string;
  createdBy: string;
  createdAt: string;
  salesmanName: string | null;
  foundInMaster: boolean;
  vdas: { code: string; label: string }[];
}

interface CodeGroup {
  salesmanCode: string;
  salesmanName: string | null;
  foundInMaster: boolean;
  vdas: { code: string; label: string }[];
  rows: AssignmentRow[];
}

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * แอดมินกำหนดเองว่าอีเมลไหนเข้าใช้งานในฐานะรหัสเซลล์ (SXXX) ไหนได้บ้าง
 *
 * หนึ่งรหัสมีได้หลายอีเมล (เช่น เซลล์ + ผู้ช่วยที่คีย์แทน) และหนึ่งอีเมลมีได้หลายรหัส —
 * แสดงเป็นกลุ่มตามรหัสเซลล์ เพราะคำถามที่แอดมินถามคือ "รหัสนี้ใครเข้าได้บ้าง"
 *
 * override การจับคู่อัตโนมัติจาก cross_target — มีผลตอนผู้ใช้ล็อกอินครั้งถัดไป
 */
export function SalesmanAssignmentPanel() {
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailsText, setEmailsText] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const emailsRef = useRef<HTMLTextAreaElement>(null);

  const emails = useMemo(() => parseEmails(emailsText), [emailsText]);
  const badEmails = emails.filter((e) => !EMAIL_RE.test(e));

  const groups = useMemo<CodeGroup[]>(() => {
    const map = new Map<string, CodeGroup>();
    for (const r of rows ?? []) {
      const g = map.get(r.salesmanCode) ?? {
        salesmanCode: r.salesmanCode,
        salesmanName: r.salesmanName,
        foundInMaster: r.foundInMaster,
        vdas: r.vdas,
        rows: [],
      };
      g.rows.push(r);
      map.set(r.salesmanCode, g);
    }
    return [...map.values()].sort((a, b) =>
      a.salesmanCode.localeCompare(b.salesmanCode)
    );
  }, [rows]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(appPath("/api/admin/salesman-assignments"), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);
      const body = (await res.json()) as { assignments: AssignmentRow[] };
      setRows(body.assignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addAssignments() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(appPath("/api/admin/salesman-assignments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, salesmanCode: code.trim() }),
      });
      const body = (await res.json().catch(() => null)) as {
        assignments?: AssignmentRow[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(friendlyError(body?.error, `เพิ่มไม่สำเร็จ (${res.status})`));
      }
      setRows(body?.assignments ?? null);
      setEmailsText("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeAssignment(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      const res = await apiFetch(
        appPath(`/api/admin/salesman-assignments?id=${encodeURIComponent(id)}`),
        { method: "DELETE" }
      );
      const body = (await res.json().catch(() => null)) as {
        assignments?: AssignmentRow[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(friendlyError(body?.error, `ลบไม่สำเร็จ (${res.status})`));
      }
      setRows(body?.assignments ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setRemovingId(null);
    }
  }

  /** ปุ่ม "+ อีเมล" ในกลุ่ม — เติมรหัสให้ในฟอร์มด้านบนแล้วพาไปช่องอีเมล */
  function startAddTo(salesmanCode: string) {
    setCode(salesmanCode);
    emailsRef.current?.focus();
    emailsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const canSubmit =
    !submitting && code.trim().length > 0 && emails.length > 0 && badEmails.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">กำหนดอีเมลให้รหัสเซลล์</CardTitle>
        <CardDescription>
          อีเมลที่เพิ่มที่นี่เข้าใช้งานในฐานะรหัสเซลล์นั้นได้ ทับการจับคู่อัตโนมัติจากไฟล์เป้าขาย ·
          หนึ่งรหัสใส่ได้หลายอีเมล · มีผลเมื่อผู้ใช้เข้าสู่ระบบครั้งถัดไป
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[8rem_1fr_auto] sm:items-start dark:border-slate-700">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            รหัสเซลล์
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="S091"
              className="mt-1 font-mono"
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
            อีเมล (ใส่ได้หลายอีเมล คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่)
            <textarea
              ref={emailsRef}
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              placeholder={"name@sahapat.co.th\nassistant@sahapat.co.th"}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-teal-500/30 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
            />
            {emails.length > 0 && (
              <span className="mt-1 block font-normal text-slate-500">
                {emails.length} อีเมล
                {badEmails.length > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {" "}
                    · รูปแบบไม่ถูกต้อง: {badEmails.join(", ")}
                  </span>
                )}
              </span>
            )}
          </label>
          <Button
            type="button"
            className="sm:mt-5"
            onClick={() => void addAssignments()}
            disabled={!canSubmit}
          >
            <UserPlus className="h-4 w-4" />
            เพิ่ม
          </Button>
        </div>

        {loading && <p className="py-4 text-center text-sm text-slate-500">กำลังโหลด...</p>}
        {!loading && groups.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">ยังไม่มีการกำหนดอีเมลให้รหัสเซลล์</p>
        )}

        <ul className="space-y-2">
          {groups.map((g) => (
            <li
              key={g.salesmanCode}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                  {g.salesmanCode}
                </span>
                {g.salesmanName && (
                  <span className="text-sm text-slate-700 dark:text-slate-200">{g.salesmanName}</span>
                )}
                {g.vdas.length === 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    รหัสนี้ยังไม่ดูแลคลังใด
                  </span>
                )}
                <span className="ml-auto flex flex-wrap gap-1">
                  {g.vdas.map((v) => (
                    <span
                      key={v.code}
                      className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                      title={v.label || undefined}
                    >
                      {v.code.toUpperCase()}
                    </span>
                  ))}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {g.rows.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-2.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    title={`ตั้งโดย ${r.createdBy}`}
                  >
                    {r.email}
                    <button
                      type="button"
                      onClick={() => void removeAssignment(r.id)}
                      disabled={removingId === r.id}
                      className="rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                      aria-label={`เอา ${r.email} ออกจาก ${g.salesmanCode}`}
                      title="เอาอีเมลนี้ออก"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => startAddTo(g.salesmanCode)}
                  className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-teal-400 hover:text-teal-700 dark:border-slate-600"
                >
                  <Plus className="h-3 w-3" />
                  อีเมล
                </button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
