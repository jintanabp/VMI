"use client";

import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
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

/**
 * แอดมินกำหนดเองว่าอีเมลไหนเข้าใช้งานในฐานะรหัสเซลล์ (SXXX) ไหนได้บ้าง
 *
 * override การจับคู่อัตโนมัติจาก cross_target — แถวที่เพิ่มที่นี่มีผลทันทีตั้งแต่
 * ล็อกอินครั้งถัดไป (ไม่ต้องรอ sync ไฟล์เป้าขาย) ใช้เมื่อคนจริงยังไม่เข้าไฟล์เป้าขาย
 * หรือแอดมินต้องคีย์ในฐานะพนักงานจริงด้วย
 */
export function SalesmanAssignmentPanel() {
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  async function addAssignment() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(appPath("/api/admin/salesman-assignments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), salesmanCode: code.trim() }),
      });
      const body = (await res.json().catch(() => null)) as {
        assignments?: AssignmentRow[];
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(friendlyError(body?.error, `เพิ่มไม่สำเร็จ (${res.status})`));
      }
      setRows(body?.assignments ?? null);
      setEmail("");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">กำหนดสิทธิ์ด้วยมือ</CardTitle>
        <CardDescription>
          อีเมลที่เพิ่มที่นี่จะเข้าใช้งานในฐานะรหัสเซลล์นั้นได้ทันที
          ทับการจับคู่อัตโนมัติจาก cross_target — ใช้เมื่อคนยังไม่เข้าไฟล์เป้าขาย
          หรือแอดมินต้องคีย์ในฐานะพนักงานจริงด้วย
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-medium text-slate-600 dark:text-slate-400">
            อีเมล
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@sahapat.co.th"
              className="mt-1"
            />
          </label>
          <label className="w-full text-xs font-medium text-slate-600 dark:text-slate-400 sm:w-32">
            รหัสเซลล์
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="S091"
              className="mt-1"
            />
          </label>
          <Button
            type="button"
            onClick={() => void addAssignment()}
            disabled={submitting || !email.trim() || !code.trim()}
          >
            <UserPlus className="h-4 w-4" />
            เพิ่ม
          </Button>
        </div>

        <div className="vmi-table-wrap">
          <div className="vmi-table-scroll max-h-[360px]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2.5">อีเมล</th>
                  <th className="px-3 py-2.5">รหัสเซลล์</th>
                  <th className="px-3 py-2.5">ครอบคลุมคลัง</th>
                  <th className="px-3 py-2.5">ตั้งโดย</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      กำลังโหลด...
                    </td>
                  </tr>
                )}
                {!loading && (rows?.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      ยังไม่มีการกำหนดสิทธิ์ด้วยมือ
                    </td>
                  </tr>
                )}
                {rows?.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 align-top dark:border-slate-700/60"
                  >
                    <td className="px-3 py-2.5">{r.email}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                        {r.salesmanCode}
                      </span>
                      {r.salesmanName && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {r.salesmanName}
                        </p>
                      )}
                      {!r.foundInMaster && (
                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          ไม่พบรหัสนี้ใน cross_salesman
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.vdas.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.vdas.map((v) => (
                            <span
                              key={v.code}
                              className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                              title={v.label || undefined}
                            >
                              {v.code.toUpperCase()}
                              {v.label ? ` · ${v.label}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {r.createdBy}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={removingId === r.id}
                        onClick={() => void removeAssignment(r.id)}
                        title="ลบสิทธิ์นี้"
                        aria-label="ลบสิทธิ์นี้"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
