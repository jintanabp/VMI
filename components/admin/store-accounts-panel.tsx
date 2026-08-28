"use client";

import { appPath } from "@/lib/paths";
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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

export interface StoreAccountRow {
  id: string;
  email: string;
  vdaCode: string;
  status: string;
  mustSetPassword: boolean;
  canManageMinMax: boolean;
  resetRequestedAt: string | null;
  createdAt: string;
}

export function StoreAccountsPanel({
  onCountChange,
}: {
  onCountChange?: (n: number) => void;
}) {
  const [accounts, setAccounts] = useState<StoreAccountRow[]>([]);
  const [vdaOptions, setVdaOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [vdaDraft, setVdaDraft] = useState<Record<string, string>>({});
  /** อีเมลของแถวที่กำลังแก้อยู่ (null = ไม่มี) + ค่าที่พิมพ์ไว้ */
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    email: "",
    vdaCode: "",
    canManageMinMax: false,
  });
  const [addError, setAddError] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** อีเมลที่รอยืนยันการลบ (null = ไม่มีกล่องยืนยันเปิดอยู่) */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(appPath("/api/admin/store-accounts"));
      const data = await res.json();
      const rows: StoreAccountRow[] = Array.isArray(data.accounts)
        ? data.accounts
        : [];
      setAccounts(rows);
      const pendingN =
        rows.filter((a) => a.status === "pending").length +
        rows.filter((a) => a.status === "approved" && a.resetRequestedAt).length;
      onCountChange?.(pendingN);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    void load();
    apiFetch(appPath("/api/vda"))
      .then((r) => r.json())
      .then((d: { sources?: string[] }) =>
        setVdaOptions(Array.isArray(d.sources) ? d.sources : [])
      )
      .catch(() => setVdaOptions([]));
  }, [load]);

  async function act(email: string, body: Record<string, unknown>) {
    setBusy(email);
    try {
      const res = await apiFetch(appPath("/api/admin/store-accounts"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...body }),
      });
      if (res.ok) {
        setActionError(null);
        await load();
      } else {
        const d = await res.json().catch(() => null);
        // ไม่ใช้ alert() — บล็อก main thread และดูเหมือนแอปค้างบน webview
        setActionError(
          typeof d?.error === "string" ? d.error : "ทำรายการไม่สำเร็จ"
        );
      }
    } finally {
      setBusy(null);
    }
  }

  /** แอดมินเพิ่มบัญชีร้านค้าเอง — อนุมัติทันที ร้านตั้งรหัสเองครั้งแรกที่เข้าระบบ */
  async function addAccount() {
    const email = addForm.email.trim().toLowerCase();
    if (!email) {
      setAddError("กรอกอีเมลก่อน");
      return;
    }
    setBusy("__add__");
    setAddError("");
    try {
      const res = await apiFetch(appPath("/api/admin/store-accounts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(friendlyError(data.error, "เพิ่มบัญชีไม่สำเร็จ"));
        return;
      }
      setAddForm({ email: "", vdaCode: "", canManageMinMax: false });
      setAddOpen(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  /** เปลี่ยนอีเมลที่ใช้ล็อกอิน — รหัสผ่านและสิทธิเดิมคงอยู่ */
  async function saveEmail(currentEmail: string) {
    const next = emailDraft.trim().toLowerCase();
    if (!next || next === currentEmail) {
      setEditingEmail(null);
      return;
    }
    setBusy(currentEmail);
    try {
      const res = await apiFetch(appPath("/api/admin/store-accounts"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentEmail,
          action: "set-email",
          newEmail: next,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(friendlyError(data.error, "เปลี่ยนอีเมลไม่สำเร็จ"));
        return;
      }
      setActionError(null);
      setEditingEmail(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(email: string) {
    setBusy(email);
    try {
      // ต้องผ่าน appPath() (basePath /vmi) และต้องเช็ค res.ok
      // เดิมยิงผิด path แล้วเรียก load() ทุกกรณี ⇒ ลบไม่สำเร็จก็ดูเหมือนสำเร็จ
      const res = await apiFetch(
        appPath(`/api/admin/store-accounts?email=${encodeURIComponent(email)}`),
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        setDeleteError(
          typeof data?.error === "string"
            ? data.error
            : `ลบบัญชีไม่สำเร็จ (${res.status})`
        );
        return;
      }
      setDeleteError(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const pending = accounts.filter((a) => a.status === "pending");
  const approved = accounts.filter((a) => a.status === "approved");
  const rejected = accounts.filter((a) => a.status === "rejected");
  const resetRequests = approved.filter((a) => a.resetRequestedAt);

  function vdaSelect(a: StoreAccountRow) {
    const value = vdaDraft[a.email] ?? a.vdaCode ?? "";
    return (
      <select
        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
        value={value}
        onChange={(e) =>
          setVdaDraft((prev) => ({ ...prev, [a.email]: e.target.value }))
        }
      >
        <option value="">— เลือก VDA —</option>
        {vdaOptions.map((v) => (
          <option key={v} value={v}>
            {v.toUpperCase()}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmDelete != null}
        title="ลบบัญชีร้านค้า?"
        body={
          <>
            <span className="font-medium">{confirmDelete}</span> จะเข้าใช้งานไม่ได้อีก
            — ต้องขอสิทธิ์และตั้งรหัสใหม่หากจะกลับมาใช้
          </>
        }
        confirmLabel="ลบบัญชี"
        onConfirm={async () => {
          if (confirmDelete) await remove(confirmDelete);
        }}
        onClose={() => setConfirmDelete(null)}
      />
      {(deleteError || actionError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {deleteError ?? actionError}
        </div>
      )}
      {resetRequests.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="text-amber-800 dark:text-amber-300">
              คำขอรีเซ็ตรหัส ({resetRequests.length})
            </CardTitle>
            <CardDescription>
              กด &quot;รีเซ็ตรหัส&quot; เพื่อให้ร้านค้าตั้งรหัสใหม่ครั้งถัดไป
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {resetRequests.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-800/50 dark:bg-amber-950/20"
              >
                <span className="font-medium">{a.email}</span>
                <span className="text-xs text-slate-500">
                  ขอเมื่อ{" "}
                  {a.resetRequestedAt
                    ? new Date(a.resetRequestedAt).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : ""}
                </span>
                <Button
                  size="sm"
                  disabled={busy === a.email}
                  onClick={() => act(a.email, { action: "reset-password" })}
                >
                  รีเซ็ตรหัส
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>รออนุมัติ ({pending.length})</CardTitle>
          <CardDescription>
            กำหนด VDA ให้ร้านค้า แล้วกดอนุมัติเพื่อให้ตั้งรหัสผ่านครั้งแรก
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-slate-500">กำลังโหลด...</p>
          ) : pending.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              ไม่มีคำขอใหม่
            </p>
          ) : (
            pending.map((a) => (
              // อีเมลเป็นบล็อกบนสุด ปุ่มรวมเป็นก้อนเดียว — เดิมทุกอย่างเป็น flex-wrap
              // ระดับเดียวกัน พอจอแคบลงปุ่มจะแตกคนละบรรทัดไม่เหมือนกันในแต่ละแถว
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center dark:border-slate-700"
              >
                <span className="min-w-0 truncate text-sm font-medium sm:flex-1">
                  {a.email}
                </span>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  {vdaSelect(a)}
                  <Button
                    size="sm"
                    disabled={busy === a.email}
                    onClick={() =>
                      act(a.email, {
                        action: "approve",
                        vdaCode: vdaDraft[a.email] ?? a.vdaCode,
                      })
                    }
                  >
                    อนุมัติ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a.email}
                    onClick={() => act(a.email, { action: "reject" })}
                  >
                    ปฏิเสธ
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>ร้านค้าที่อนุมัติแล้ว ({approved.length})</CardTitle>
              <CardDescription>
                เพิ่มบัญชีเอง · แก้อีเมล · ตั้งค่า VDA และสิทธิจัดการ min/max
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={addOpen ? "ghost" : "outline"}
              onClick={() => {
                setAddOpen((v) => !v);
                setAddError("");
              }}
            >
              {addOpen ? (
                "ยกเลิก"
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  เพิ่มบัญชีร้านค้า
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {addOpen && (
            <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800/60 dark:bg-teal-950/20">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                บัญชีจะถูกอนุมัติทันที — ร้านค้าตั้งรหัสผ่านเองครั้งแรกที่เข้าระบบ
                (แอดมินไม่ต้องตั้งรหัสให้)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="email"
                  autoComplete="off"
                  className="h-8 w-full min-w-0 text-sm sm:w-auto sm:flex-1"
                  placeholder="อีเมลร้านค้า เช่น store@example.com"
                  value={addForm.email}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, email: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addAccount();
                  }}
                />
                <select
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  value={addForm.vdaCode}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, vdaCode: e.target.value }))
                  }
                >
                  <option value="">— เลือก VDA —</option>
                  {vdaOptions.map((v) => (
                    <option key={v} value={v}>
                      {v.toUpperCase()}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={addForm.canManageMinMax}
                    onChange={(e) =>
                      setAddForm((f) => ({
                        ...f,
                        canManageMinMax: e.target.checked,
                      }))
                    }
                  />
                  จัดการ min/max
                </label>
                <Button
                  size="sm"
                  disabled={busy === "__add__"}
                  onClick={() => void addAccount()}
                >
                  {busy === "__add__" ? "กำลังเพิ่ม..." : "เพิ่มบัญชี"}
                </Button>
              </div>
              {addError && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {addError}
                </p>
              )}
            </div>
          )}
          {approved.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              ยังไม่มีร้านค้าที่อนุมัติ
            </p>
          ) : (
            approved.map((a) => (
              // โครง 2 ชั้น: ข้อมูลร้าน / กลุ่มปุ่ม — เดิมอีเมล(flex-1)กับปุ่มอีก 6 ตัว
              // อยู่ระดับ flex-wrap เดียวกัน ทำให้แต่ละแถวตัดบรรทัดไม่เหมือนกัน
              // (ยาวสั้นตามอีเมล) ปุ่มเลยเยื้องกันมั่วทั้งการ์ด
              <div
                key={a.id}
                className="flex flex-col gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 xl:flex-row xl:items-center dark:border-slate-700"
              >
                <div className="min-w-0 xl:flex-1">
                  {editingEmail === a.email ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Input
                        type="email"
                        autoComplete="off"
                        autoFocus
                        className="h-8 min-w-0 flex-1 text-sm"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveEmail(a.email);
                          if (e.key === "Escape") setEditingEmail(null);
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={busy === a.email}
                        onClick={() => void saveEmail(a.email)}
                      >
                        บันทึก
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingEmail(null)}
                      >
                        ยกเลิก
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium">{a.email}</p>
                      <p className="text-xs text-slate-500">
                        VDA: {a.vdaCode?.toUpperCase() || "—"}
                        {a.mustSetPassword ? " · ยังไม่ตั้งรหัส" : ""}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 xl:shrink-0">
                  {editingEmail === a.email ? null : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === a.email}
                      title="เปลี่ยนอีเมลที่ใช้ล็อกอิน (รหัสผ่านและสิทธิเดิมคงอยู่)"
                      onClick={() => {
                        setEditingEmail(a.email);
                        setEmailDraft(a.email);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      แก้อีเมล
                    </Button>
                  )}
                  {vdaSelect(a)}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a.email}
                    onClick={() =>
                      act(a.email, {
                        action: "set-vda",
                        vdaCode: vdaDraft[a.email] ?? a.vdaCode,
                      })
                    }
                  >
                    บันทึก VDA
                  </Button>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={a.canManageMinMax}
                      disabled={busy === a.email}
                      onChange={(e) =>
                        act(a.email, {
                          action: "set-can-manage",
                          canManageMinMax: e.target.checked,
                        })
                      }
                    />
                    จัดการ min/max
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === a.email}
                    onClick={() => act(a.email, { action: "reset-password" })}
                  >
                    รีเซ็ตรหัส
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    disabled={busy === a.email}
                    onClick={() => setConfirmDelete(a.email)}
                  >
                    ลบ
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {rejected.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ถูกปฏิเสธ ({rejected.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rejected.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm sm:flex-row sm:items-center dark:border-slate-700"
              >
                <span className="min-w-0 truncate text-slate-500 sm:flex-1">
                  {a.email}
                </span>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === a.email}
                    onClick={() => act(a.email, { action: "approve" })}
                  >
                    อนุมัติใหม่
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    disabled={busy === a.email}
                    onClick={() => setConfirmDelete(a.email)}
                  >
                    ลบ
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
