"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Info, Plus, Save, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appPath } from "@/lib/paths";
import { cn } from "@/lib/utils";

/**
 * ทะเบียนคลัง VDA — "vda1 คือลูกค้ารหัสไหน"
 *
 * ความรู้ชิ้นนี้ไม่มีไฟล์ไหนบอกได้ (ชื่อใน dim_customer เป็นชื่อบริษัท ไม่มีคำว่า VDA)
 * เดิมอยู่ใน VDA_CUSTOMER_MAP ของ .env บนเซิร์ฟเวอร์ เปิดคลังใหม่ทีต้องให้คนที่เข้า
 * เซิร์ฟเวอร์ได้แก้ไฟล์แล้ว restart ทั้งระบบ ตอนนี้แก้จากหน้านี้ได้เลย
 */

interface WarehouseRow {
  code: string;
  customerCodes: string[];
  label: string;
  active: boolean;
  source: "db" | "env";
}

interface DraftRow {
  code: string;
  customerCodes: string;
  label: string;
  active: boolean;
  source: "db" | "env";
}

function toDraft(w: WarehouseRow): DraftRow {
  return {
    code: w.code,
    customerCodes: w.customerCodes.join(", "),
    label: w.label,
    active: w.active,
    source: w.source,
  };
}

export function VdaWarehousePanel() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(appPath("/api/admin/vda-warehouses"), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`โหลดทะเบียนคลังไม่สำเร็จ (${res.status})`);
      const body = (await res.json()) as { warehouses: WarehouseRow[] };
      setRows(body.warehouses.map(toDraft));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(index: number, next: Partial<DraftRow>) {
    setSaved(false);
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...next } : r))
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        warehouses: rows
          .filter((r) => r.code.trim() && r.customerCodes.trim())
          .map((r) => ({
            code: r.code.trim(),
            // รับทั้ง , และ | เพราะรูปแบบใน .env เดิมใช้ | คั่นหลายรหัสของคลังเดียว
            customerCodes: r.customerCodes
              .split(/[,|]/)
              .map((c) => c.trim())
              .filter(Boolean),
            label: r.label.trim(),
            active: r.active,
          })),
      };
      const res = await fetch(appPath("/api/admin/vda-warehouses"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as {
        warehouses?: WarehouseRow[];
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error ?? `บันทึกไม่สำเร็จ (${res.status})`);
      if (body?.warehouses) setRows(body.warehouses.map(toDraft));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const fromEnv = rows.filter((r) => r.source === "env").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ทะเบียนคลัง VDA</CardTitle>
        <CardDescription>
          กำหนดว่าคลังแต่ละตัวคือบัญชีลูกค้ารหัสไหน — ใช้จับยอดขายรายวันและหาเซลล์ผู้ดูแล
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-start gap-1.5 rounded-lg bg-teal-50 px-2 py-1.5 text-xs text-teal-900 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-100 dark:ring-teal-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <b>รหัสเซลล์ไม่ต้องกรอก</b> — ระบบจับคู่จากไฟล์เป้าขาย
            (cross_target_current_month) โดยใช้รหัสลูกค้าที่กรอกไว้ตรงนี้เป็นตัวจับ
            เพิ่มคลังใหม่แล้วกดบันทึก ระบบจะเริ่มดึงข้อมูลของคลังนั้นในรอบ sync ถัดไป
          </span>
        </p>

        {fromEnv > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              มี {fromEnv} คลังที่ยังมาจาก <code>VDA_CUSTOMER_MAP</code> ใน .env
              — กดบันทึกหนึ่งครั้งเพื่อย้ายเข้าฐานข้อมูล จากนั้นแก้จากหน้านี้ได้เลย
            </span>
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="vmi-table-wrap">
          <div className="vmi-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">
                  <th className="w-28 px-2 py-2 font-semibold">รหัสคลัง</th>
                  <th className="px-2 py-2 font-semibold">
                    รหัสลูกค้า
                    <span className="block font-normal text-[10px] leading-tight text-slate-400">
                      หลายรหัสคั่นด้วย , หรือ |
                    </span>
                  </th>
                  <th className="px-2 py-2 font-semibold">ชื่อเรียก (ไม่บังคับ)</th>
                  <th className="w-20 px-2 py-2 text-center font-semibold">ใช้งาน</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={`${row.code}-${i}`}
                    className={cn(
                      "border-b border-slate-100 last:border-0 dark:border-slate-800",
                      !row.active && "opacity-60"
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.code}
                        onChange={(e) => patch(i, { code: e.target.value })}
                        placeholder="vda6"
                        className="h-8 font-mono text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.customerCodes}
                        onChange={(e) =>
                          patch(i, { customerCodes: e.target.value })
                        }
                        placeholder="3231847"
                        className="h-8 font-mono text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={row.label}
                        onChange={(e) => patch(i, { label: e.target.value })}
                        placeholder="คลังบางพลี"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(e) => patch(i, { active: e.target.checked })}
                        className="h-4 w-4 accent-teal-600"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`ลบ ${row.code}`}
                        onClick={() => {
                          setSaved(false);
                          setRows((prev) => prev.filter((_, x) => x !== i));
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-slate-400">
                      ยังไม่มีคลังในทะเบียน
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSaved(false);
              setRows((prev) => [
                ...prev,
                {
                  code: "",
                  customerCodes: "",
                  label: "",
                  active: true,
                  source: "db",
                },
              ]);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            เพิ่มคลัง
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
            <Save className="mr-1 h-4 w-4" />
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
          {saved && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              บันทึกแล้ว — ทะเบียนเซลล์ถูกจับคู่ใหม่ให้ทันที
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
