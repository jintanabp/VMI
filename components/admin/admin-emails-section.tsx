"use client";

import { appPath } from "@/lib/paths";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAsyncAction } from "@/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch } from "@/lib/api-fetch";
import { friendlyError } from "@/lib/error-message";

interface AdminRow {
  email: string;
  fromEnv: boolean;
  addedBy: string;
}

interface SalesAssignment {
  id: string;
  email: string;
  salesmanCode: string;
  salesmanName: string | null;
}

/**
 * ผู้ดูแลระบบ 2 ระดับ (creator เท่านั้นที่เห็นหน้านี้):
 * - Creator = อีเมลใน .env — ทำได้ทุกอย่าง ลบผ่าน UI ไม่ได้
 * - Admin = เพิ่มที่นี่ — เห็นแค่แท็บร้านค้า (อนุมัติ/รีเซ็ตรหัส/เพิ่มบัญชี) · โปรโมชั่น (ดูอย่างเดียว) · สิทธิ์เซลล์-VDA (ดู + เพิ่มอีเมล)
 *
 * «เป็นเซลล์ด้วย» = อีเมลนั้นถูกกำหนดรหัสเซลล์ไว้ที่หน้าสิทธิ์เซลล์-VDA — หน้านี้แสดงอย่างเดียว
 * (เพิ่ม/เอาออกที่หน้านั้นที่เดียว ไม่ให้ซ้ำซ้อน) · admin ที่มีรหัสเข้าหน้าเซลล์เป็นหน้าแรก
 */
export function AdminEmailsSection() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [assignments, setAssignments] = useState<SalesAssignment[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  /** อีเมลที่รอยืนยันการลบ (null = ไม่มีกล่องยืนยันเปิดอยู่) */
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [adminData, assignData] = await Promise.all([
      apiFetch(appPath("/api/admin/admins")).then((r) => (r.ok ? r.json() : [])),
      apiFetch(appPath("/api/admin/salesman-assignments")).then((r) =>
        r.ok ? r.json() : { assignments: [] }
      ),
    ]);
    setAdmins(Array.isArray(adminData) ? adminData : []);
    setAssignments(Array.isArray(assignData?.assignments) ? assignData.assignments : []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addAdmin = useAsyncAction(
    async () => {
      setMsg("");
      const email = newEmail.trim();
      if (!email) return;
      const res = await apiFetch(appPath("/api/admin/admins"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setMsg(friendlyError(data?.error, `เพิ่มไม่สำเร็จ (${res.status})`));
        return;
      }
      setNewEmail("");
      setMsg(`เพิ่ม ${email} แล้ว`);
      await reload();
    },
    { onError: (m) => setMsg(m) }
  );

  const removeAdmin = useAsyncAction(
    async (email: string) => {
      setMsg("");
      const res = await apiFetch(
        appPath(`/api/admin/admins?email=${encodeURIComponent(email)}`),
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`ลบไม่สำเร็จ (${res.status})`);
      setMsg(`ลบ ${email} แล้ว`);
      await reload();
    },
    { onError: (m) => setMsg(m) }
  );

  const codesFor = (email: string) =>
    assignments.filter((a) => a.email.toLowerCase() === email.toLowerCase());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ผู้ดูแลระบบ</CardTitle>
        <CardDescription>
          <span className="font-medium text-amber-700 dark:text-amber-400">Creator</span> = อีเมลใน{" "}
          <code className="text-xs">ADMIN_EMAILS</code> ใน .env — ทำได้ทุกอย่าง (ลบผ่าน UI ไม่ได้) ·{" "}
          <span className="font-medium text-teal-700 dark:text-teal-400">Admin</span> = เพิ่มที่นี่ —
          เห็นแค่แท็บร้านค้า (อนุมัติ · รีเซ็ตรหัส · เพิ่มบัญชี) · ดูโปรโมชั่น · สิทธิ์เซลล์-VDA (ดู + เพิ่มอีเมล) · ถ้าอีเมลถูกกำหนดเป็นเซลล์ไว้ที่แท็บ{" "}
          <Link href="/admin/system/vda-sales" className="underline">
            สิทธิ์เซลล์-VDA
          </Link>{" "}
          จะขึ้นป้าย «เป็นเซลล์ด้วย» ที่นี่ (เพิ่ม/เอาออกที่แท็บนั้น)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConfirmDialog
          open={confirmEmail != null}
          title="ลบผู้ดูแลระบบ?"
          body={
            <>
              <span className="font-medium">{confirmEmail}</span> จะไม่มีสิทธิ์
              admin อีก (ถ้ามีรหัสเซลล์ ยังเข้าใช้งานในบทบาทเซลล์ได้ตามปกติ)
            </>
          }
          confirmLabel="ลบสิทธิ์ admin"
          onConfirm={async () => {
            if (confirmEmail) await removeAdmin.run(confirmEmail);
          }}
          onClose={() => setConfirmEmail(null)}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="flex-1"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="เพิ่มอีเมล admin เช่น name@sahapat.co.th"
          />
          <Button pending={addAdmin.pending} onClick={() => addAdmin.run()}>
            เพิ่ม
          </Button>
        </div>
        {msg && <p className="text-sm text-slate-600 dark:text-slate-400">{msg}</p>}
        <ul className="space-y-2">
          {admins.map((a) => {
            const codes = codesFor(a.email);
            return (
              <li
                key={a.email}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 lg:flex-row lg:items-center dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="min-w-0 lg:flex-1">
                  <p className="flex min-w-0 items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                    <span className="truncate">{a.email}</span>
                    {a.fromEnv ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        Creator · .env
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-400">
                        Admin
                      </span>
                    )}
                  </p>
                  {a.addedBy && a.addedBy !== "<bootstrap>" && (
                    <p className="text-xs text-slate-500">เพิ่มโดย {a.addedBy}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0">
                  {codes.length > 0 && (
                    <>
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800">
                        เป็นเซลล์ด้วย
                      </span>
                      {codes.map((c) => (
                        <span
                          key={c.id}
                          title={c.salesmanName ?? undefined}
                          className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {c.salesmanCode}
                        </span>
                      ))}
                    </>
                  )}
                  {!a.fromEnv && (
                    <button
                      type="button"
                      disabled={removeAdmin.pending}
                      className="ml-1 shrink-0 text-xs text-slate-500 hover:text-red-600 disabled:opacity-50"
                      onClick={() => {
                        if (removeAdmin.pending) return;
                        setConfirmEmail(a.email);
                      }}
                    >
                      ลบ
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {admins.length === 0 && (
            <p className="text-sm text-slate-500">ยังไม่มี admin ในระบบ</p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
