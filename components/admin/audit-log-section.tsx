"use client";

import { appPath } from "@/lib/paths";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import { friendlyError } from "@/lib/error-message";
import {
  AUDIT_ACTION_LABELS,
  formatAuditDetail,
  type AuditLogRow,
} from "@/lib/admin/audit-log-labels";
import { cn } from "@/lib/utils";

/** สีเดียวกับป้ายในหน้า «ผู้ดูแล» (admin-emails-section) — Creator เหลือง · Admin เขียวอมฟ้า */
const ROLE_LABEL: Record<string, { label: string; className: string }> = {
  creator: {
    label: "Creator",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  admin: {
    label: "Admin",
    className: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  },
  sales: {
    label: "เซลล์",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

function fmtBangkok(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

export function AuditLogSection() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (afterId?: string) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (action) params.set("action", action);
        if (afterId) params.set("after", afterId);
        const res = await apiFetch(appPath(`/api/admin/audit-log?${params}`));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(friendlyError(data?.error, `โหลดบันทึกไม่สำเร็จ (${res.status})`));
          return;
        }
        setRows((prev) => (afterId ? [...prev, ...data.rows] : data.rows));
        setHasMore(!!data.hasMore);
      } catch (err) {
        // เน็ตหลุด = "Failed to fetch" ภาษาอังกฤษ — แปลงเป็นข้อความไทยแบบหน้าอื่น
        setError(friendlyError(err instanceof Error ? err.message : "", "โหลดบันทึกไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่"));
      } finally {
        setLoading(false);
      }
    },
    [q, action]
  );

  // ค้นหาใหม่เมื่อเปลี่ยนตัวกรอง — หน่วงช่องค้นหาเล็กน้อยไม่ให้ยิงทุกตัวอักษร
  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาอีเมลผู้ทำรายการ / อีเมลร้าน / รหัส"
            aria-label="ค้นหาบันทึก"
            className="h-9 w-full sm:w-80"
          />
          <select
            aria-label="ประเภทการทำงาน"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm sm:w-auto dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">ทุกประเภท</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          เริ่มบันทึกตั้งแต่ 29 ก.ย. 2569 — ก่อนหน้านั้นไม่มีข้อมูล · เวลาเป็นเวลาไทย · ไม่มีการเก็บรหัสตั้งค่าหรือรหัสผ่าน
        </p>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {/* มือถือ: การ์ดทีละแถว — ตาราง 5 คอลัมน์บนจอแคบต้องเลื่อนข้างแล้วอีเมลถูกตัดขอบ */}
        <ul className="space-y-2 sm:hidden">
          {loading && rows.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">กำลังโหลด…</li>
          )}
          {rows.map((r) => {
            const role = ROLE_LABEL[r.actorRole] ?? ROLE_LABEL.sales;
            const detail = formatAuditDetail(r.detail);
            return (
              <li
                key={r.id}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <span className="font-semibold">{r.actionLabel}</span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {fmtBangkok(r.createdAt)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs [overflow-wrap:anywhere]">{r.target || "—"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="[overflow-wrap:anywhere]">{r.actorEmail}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", role.className)}>
                    {role.label}
                  </span>
                </div>
                {detail && (
                  <div className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                    {detail}
                  </div>
                )}
              </li>
            );
          })}
          {rows.length === 0 && !loading && (
            <li className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              ยังไม่มีบันทึกที่ตรงกับตัวกรอง
            </li>
          )}
        </ul>

        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block dark:border-slate-700">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <colgroup>
              <col className="w-[170px]" />
              <col className="w-[210px]" />
              <col className="w-[170px]" />
              <col className="w-[180px]" />
              <col />
            </colgroup>
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">เวลา</th>
                <th className="px-3 py-2 font-semibold">ผู้ทำรายการ</th>
                <th className="px-3 py-2 font-semibold">การทำงาน</th>
                <th className="px-3 py-2 font-semibold">เป้าหมาย</th>
                <th className="px-3 py-2 font-semibold">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => {
                const role = ROLE_LABEL[r.actorRole] ?? ROLE_LABEL.sales;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">
                      {fmtBangkok(r.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="[overflow-wrap:anywhere]">{r.actorEmail}</div>
                      <span
                        className={cn(
                          "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold",
                          role.className
                        )}
                      >
                        {role.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 break-words font-medium">{r.actionLabel}</td>
                    <td className="px-3 py-2 text-xs [overflow-wrap:anywhere]">{r.target || "—"}</td>
                    <td className="px-3 py-2 break-words text-xs text-slate-600 dark:text-slate-300">
                      {formatAuditDetail(r.detail) || "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                    {loading ? "กำลังโหลด…" : "ยังไม่มีบันทึกที่ตรงกับตัวกรอง"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load(rows[rows.length - 1]?.id)}
            >
              {loading ? "กำลังโหลด…" : "โหลดเพิ่ม"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
