"use client";

import { appPath } from "@/lib/paths";
import { useEffect, useState } from "react";
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

export function AdminEmailsSection() {
  const [admins, setAdmins] = useState<
    { email: string; fromEnv: boolean; addedBy: string }[]
  >([]);
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState("");
  /** อีเมลที่รอยืนยันการลบ (null = ไม่มีกล่องยืนยันเปิดอยู่) */
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(appPath("/api/admin/admins"))
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAdmins(Array.isArray(data) ? data : []));
  }, []);

  async function reload() {
    const data = await apiFetch(appPath("/api/admin/admins")).then((r) => r.json());
    setAdmins(Array.isArray(data) ? data : []);
  }

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
        setMsg(data?.error ?? `เพิ่มไม่สำเร็จ (${res.status})`);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ผู้ดูแลระบบ (Admin)</CardTitle>
        <CardDescription>
          อีเมลใน <code className="text-xs">ADMIN_EMAILS</code> /{" "}
          <code className="text-xs">APP_ADMINS</code> ใน .env จะถูก seed อัตโนมัติ
          (ลบผ่าน UI ไม่ได้)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConfirmDialog
          open={confirmEmail != null}
          title="ลบผู้ดูแลระบบ?"
          body={
            <>
              <span className="font-medium">{confirmEmail}</span> จะไม่มีสิทธิ์
              admin อีก (ยังเข้าใช้งานในบทบาทเซลล์ได้ตามปกติ)
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
          {admins.map((a) => (
            <li
              key={a.email}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                  {a.email}
                  {a.fromEnv && (
                    <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                      .env
                    </span>
                  )}
                </p>
                {a.addedBy && a.addedBy !== "<bootstrap>" && (
                  <p className="text-xs text-slate-500">เพิ่มโดย {a.addedBy}</p>
                )}
              </div>
              {!a.fromEnv && (
                <button
                  type="button"
                  disabled={removeAdmin.pending}
                  className="shrink-0 text-xs text-slate-500 hover:text-red-600 disabled:opacity-50"
                  onClick={() => {
                    if (removeAdmin.pending) return;
                    setConfirmEmail(a.email);
                  }}
                >
                  ลบ
                </button>
              )}
            </li>
          ))}
          {admins.length === 0 && (
            <p className="text-sm text-slate-500">ยังไม่มี admin ในระบบ</p>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
