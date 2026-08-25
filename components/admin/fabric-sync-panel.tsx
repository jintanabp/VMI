"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Minus, RefreshCw, X } from "lucide-react";
import { appPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MobileRow,
  MobileRowList,
  MobileRowStats,
  MobileRowTop,
  MobileStat,
} from "@/components/ui/mobile-row";
import { cn } from "@/lib/utils";

interface DatasetRow {
  id: string;
  label: string;
  fileName: string;
  localPath: string;
  configured: boolean;
  exists: boolean;
  bytes: number | null;
  rows: number | null;
  mtime: string | null;
  ageHours: number | null;
  minRows: number;
  minRowsEnv: string;
  required: boolean;
  belowMinRows: boolean;
  stale: boolean;
  lastOk: boolean | null;
  lastError: string | null;
  lastDurationMs: number | null;
  lastAt: string | null;
  lastTrigger: string | null;
  skipped: boolean;
}

interface SyncStatus {
  schedulerEnabled: boolean;
  schedule: { hour: number; minute: number; tz: string };
  nextRunAt: string | null;
  maxDataAgeHours: number;
  running: boolean;
  status: {
    lastSuccessAt?: string;
    lastFailureAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
    lastTrigger?: string;
    lastDurationMs?: number;
  };
  datasets: DatasetRow[];
  promoReady: boolean;
  promoError: string | null;
  promoCoverage: PromoCoverage | null;
}

/** จำนวน SKU ที่ได้โปรจริงจากรอบ sync ล่าสุด — วัดหลังโหลดไฟล์เข้าหน่วยความจำแล้ว */
interface PromoCoverage {
  at: string;
  skusWithPromo: number;
  skusChecked: number;
  byStore: Record<string, { withPromo: number; checked: number }>;
}

const TRIGGER_LABEL: Record<string, string> = {
  scheduler: "อัตโนมัติ",
  boot: "ตอนสตาร์ท",
  admin: "แอดมินกด",
  store: "ร้านค้ากด",
  cli: "คำสั่ง CLI",
};

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtAge(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} นาที`;
  if (h < 48) return `${h.toFixed(1)} ชม.`;
  return `${Math.round(h / 24)} วัน`;
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} วิ`;
}

type Tone = "ok" | "warn" | "error" | "muted";

/** สถานะรวมของแถว — เรียงตามความรุนแรง ให้เห็นปัญหาจริงก่อนเรื่องเล็ก */
function rowState(d: DatasetRow): { tone: Tone; label: string; hint?: string } {
  if (!d.configured) {
    return { tone: "muted", label: "ไม่ได้ตั้งค่า", hint: "ยังไม่ได้ตั้ง env ของชุดข้อมูลนี้" };
  }
  if (!d.exists) {
    return {
      tone: d.required ? "error" : "muted",
      label: "ยังไม่มีไฟล์",
      hint: d.lastError ?? undefined,
    };
  }
  if (d.belowMinRows) {
    return {
      tone: "error",
      label: `แถวน้อยกว่าขั้นต่ำ (${d.minRows.toLocaleString()})`,
      hint: `ปรับได้ที่ env ${d.minRowsEnv}`,
    };
  }
  if (d.lastOk === false && d.lastError) {
    return {
      tone: d.required ? "error" : "warn",
      label: d.skipped ? "ยังไม่มีต้นทาง" : "ดึงไม่สำเร็จ",
      hint: d.lastError,
    };
  }
  if (d.stale) {
    return { tone: "warn", label: `เก่า ${fmtAge(d.ageHours)}`, hint: "เกินอายุที่กำหนด" };
  }
  return { tone: "ok", label: "ปกติ" };
}

const TONE_CLASS: Record<Tone, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  error: "text-red-700 dark:text-red-400",
  muted: "text-slate-400 dark:text-slate-500",
};

function StateIcon({ tone }: { tone: Tone }) {
  const cls = cn("h-3.5 w-3.5 shrink-0", TONE_CLASS[tone]);
  if (tone === "ok") return <Check className={cls} />;
  if (tone === "warn") return <AlertTriangle className={cls} />;
  if (tone === "error") return <X className={cls} />;
  return <Minus className={cls} />;
}

export function FabricSyncPanel() {
  const [data, setData] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** id ของชุดข้อมูลที่กำลังดึง — "__all__" คือกดดึงทั้งหมด */
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(appPath("/api/admin/refresh-status"), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`โหลดสถานะไม่สำเร็จ (${res.status})`);
      setData((await res.json()) as SyncStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดสถานะไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ระหว่างมีรอบ sync ทำงาน ต้อง poll เอง — เดิมสถานะค้างจนกดรีโหลดหน้า
  const running = data?.running ?? false;
  useEffect(() => {
    if (!running && !busy) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [running, busy, load]);

  async function refresh(datasets?: string[]) {
    const key = datasets?.[0] ?? "__all__";
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(appPath("/api/admin/refresh-masters"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datasets ? { datasets } : {}),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        setError(body?.message ?? body?.error ?? `ดึงข้อมูลไม่สำเร็จ (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดึงข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(null);
      await load();
    }
  }

  const st = data?.status;
  const failedCount =
    data?.datasets.filter((d) => rowState(d).tone === "error").length ?? 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ตั้งเวลาอัตโนมัติ</CardTitle>
          <CardDescription>
            ทุกทริกเกอร์ (อัตโนมัติ / ตอนสตาร์ท / แอดมิน / ร้านค้า) ดึงชุดข้อมูลเดียวกัน
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-slate-500">สถานะ</dt>
              <dd
                className={cn(
                  "font-semibold sm:ml-auto",
                  data?.schedulerEnabled
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-slate-500"
                )}
              >
                {data
                  ? data.schedulerEnabled
                    ? `เปิด · ทุกวัน ${String(data.schedule.hour).padStart(2, "0")}:${String(
                        data.schedule.minute
                      ).padStart(2, "0")} น. (${data.schedule.tz})`
                    : "ปิด (MASTER_REFRESH_ENABLED=false)"
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-slate-500">รอบถัดไป</dt>
              <dd className="sm:ml-auto">{fmtTime(data?.nextRunAt)}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-slate-500">สำเร็จล่าสุด</dt>
              <dd className="sm:ml-auto">
                {fmtTime(st?.lastSuccessAt)}
                {st?.lastTrigger && (
                  <span className="ml-1.5 text-xs text-slate-500">
                    ({TRIGGER_LABEL[st.lastTrigger] ?? st.lastTrigger}
                    {st.lastDurationMs != null
                      ? `, ${fmtDuration(st.lastDurationMs)}`
                      : ""}
                    )
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-slate-500">พยายามล่าสุด</dt>
              <dd className="sm:ml-auto">{fmtTime(st?.lastAttemptAt)}</dd>
            </div>
            <div className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-slate-500">อายุที่ยอมรับ</dt>
              <dd className="sm:ml-auto">{data?.maxDataAgeHours ?? "—"} ชม.</dd>
            </div>
            {st?.lastFailureAt && (
              <div className="flex justify-between gap-2 sm:justify-start">
                <dt className="text-slate-500">ล้มเหลวล่าสุด</dt>
                <dd className="text-amber-700 sm:ml-auto dark:text-amber-400">
                  {fmtTime(st.lastFailureAt)}
                </dd>
              </div>
            )}
          </dl>

          {data && !data.promoReady && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
              ⚠ ตาราง C4 ไม่พร้อมใช้งาน — โปรโมชั่นจะไม่ขึ้นทั้งระบบ
              {data.promoError ? `: ${data.promoError}` : ""}
            </p>
          )}
          {data?.promoReady && data.promoError && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              C4: {data.promoError}
            </p>
          )}

          {data?.promoCoverage && (
            <PromoCoverageLine coverage={data.promoCoverage} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void refresh()}
              pending={busy === "__all__" || running}
            >
              <RefreshCw className="h-4 w-4" />
              ดึงข้อมูลทั้งหมดตอนนี้
            </Button>
            {running && (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <Clock className="h-3.5 w-3.5 animate-pulse" />
                กำลังดึงข้อมูล...
              </span>
            )}
            {failedCount > 0 && !running && (
              <span className="text-sm text-red-700 dark:text-red-400">
                {failedCount} ชุดข้อมูลมีปัญหา
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            ชุดข้อมูลรายตาราง ({data?.datasets.length ?? 0})
          </CardTitle>
          <CardDescription>
            กด &quot;ดึงใหม่&quot; รายชุดได้ — สถานะของชุดอื่นจะไม่ถูกล้าง
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* เดสก์ท็อป: ตารางเดียวเห็นครบ */}
          <div className="vmi-scroll -mx-2 hidden overflow-x-auto px-2 lg:block">
            <table className="vmi-data-table w-full text-left">
              <thead>
                <tr>
                  <th className="px-2 py-2">ชุดข้อมูล</th>
                  <th className="px-2 py-2">ไฟล์</th>
                  <th className="px-2 py-2 text-right">แถว</th>
                  <th className="px-2 py-2 text-right">ขนาด</th>
                  <th className="px-2 py-2 text-right">อายุ</th>
                  <th className="px-2 py-2">อัปเดตล่าสุด</th>
                  <th className="px-2 py-2">สถานะรอบล่าสุด</th>
                  <th className="px-2 py-2 text-right">เวลา</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {(data?.datasets ?? []).map((d) => {
                  const state = rowState(d);
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-2 py-2">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {d.label}
                        </span>
                        {!d.required && (
                          <span className="ml-1.5 text-[10px] text-slate-400">
                            ไม่บังคับ
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-500">
                        {d.fileName}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <span
                          className={cn(
                            d.belowMinRows && "font-semibold text-red-700 dark:text-red-400"
                          )}
                          title={
                            d.minRows > 0
                              ? `ขั้นต่ำ ${d.minRows.toLocaleString()} (${d.minRowsEnv})`
                              : undefined
                          }
                        >
                          {d.rows?.toLocaleString() ?? "—"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {fmtBytes(d.bytes)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular-nums",
                          d.stale && "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {fmtAge(d.ageHours)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-slate-500">
                        {fmtTime(d.mtime)}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5",
                            TONE_CLASS[state.tone]
                          )}
                          title={state.hint}
                        >
                          <StateIcon tone={state.tone} />
                          {state.label}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                        {fmtDuration(d.lastDurationMs)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={!d.configured || running || busy != null}
                          pending={busy === d.id}
                          onClick={() => void refresh([d.id])}
                        >
                          ดึงใหม่
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* มือถือ: การ์ดเดียวกัน — หน้าแอดมินเดิมไม่มี responsive story สำหรับตาราง */}
          <MobileRowList grid className="lg:hidden">
            {(data?.datasets ?? []).map((d) => {
              const state = rowState(d);
              return (
                <MobileRow key={d.id} warn={state.tone === "error"}>
                  <MobileRowTop>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {d.label}
                      </p>
                      <p className="truncate font-mono text-[10px] text-slate-500">
                        {d.fileName}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 px-2 text-xs"
                      disabled={!d.configured || running || busy != null}
                      pending={busy === d.id}
                      onClick={() => void refresh([d.id])}
                    >
                      ดึงใหม่
                    </Button>
                  </MobileRowTop>
                  <MobileRowStats>
                    <MobileStat label="แถว" value={d.rows?.toLocaleString() ?? "—"} warn={d.belowMinRows} />
                    <MobileStat label="ขนาด" value={fmtBytes(d.bytes)} />
                    <MobileStat label="อายุ" value={fmtAge(d.ageHours)} warn={d.stale} />
                    <MobileStat
                      label="สถานะ"
                      value={state.label}
                      warn={state.tone !== "ok"}
                      title={state.hint}
                    />
                  </MobileRowStats>
                </MobileRow>
              );
            })}
          </MobileRowList>

          {(data?.datasets ?? []).some((d) => d.lastError) && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-slate-500">
                ดูข้อความ error ดิบ
              </summary>
              <ul className="mt-2 space-y-1">
                {(data?.datasets ?? [])
                  .filter((d) => d.lastError)
                  .map((d) => (
                    <li key={d.id} className="break-all text-slate-500">
                      <span className="font-mono">{d.id}</span>: {d.lastError}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * ตัวเลขที่บอกว่า "โปรยังมาถึงร้านอยู่ไหม" ไม่ใช่แค่ "ไฟล์มาไหม"
 *
 * ต้องแยกจากป้าย promoReady: ไฟล์ที่โหลดผ่านแต่ resolve เป็นโปรไม่ได้สักตัว
 * ขึ้นเขียวทุกป้ายอยู่ดี — ที่ผ่านมาจึงไม่มีใครเห็นว่าโปรหายไปทั้งระบบเป็นวัน ๆ
 */
function PromoCoverageLine({ coverage }: { coverage: PromoCoverage }) {
  const dark = Object.entries(coverage.byStore)
    .filter(([, c]) => c.withPromo === 0)
    .map(([store]) => store);
  const pct =
    coverage.skusChecked > 0
      ? Math.round((coverage.skusWithPromo / coverage.skusChecked) * 100)
      : 0;

  if (coverage.skusWithPromo === 0) {
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
        ⚠ ไฟล์ C4 โหลดได้ แต่ไม่มี SKU ไหนได้โปรเลยสักตัวจาก{" "}
        {coverage.skusChecked} ตัว — ตรวจ C4_DEFAULT_DIVISION /
        C4_DEFAULT_CUSGROUP / C4_VDA_DIVISION_MAP ให้ตรงกับไฟล์
      </p>
    );
  }

  if (dark.length > 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        ⚠ คลังที่ไม่มีโปรเลย: {dark.join(", ")} — SKU ที่มีโปรรวม{" "}
        {coverage.skusWithPromo}/{coverage.skusChecked}
      </p>
    );
  }

  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">
      SKU ที่มีโปร {coverage.skusWithPromo}/{coverage.skusChecked} ({pct}%) ·
      วัดเมื่อ {fmtTime(coverage.at)}
    </p>
  );
}
