"use client";

import { appPath } from "@/lib/paths";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import {
  getPeopleWithVda,
  useVdaSalesDirectory,
  type PersonVdaRow,
} from "@/hooks/use-vda-sales-directory";
import { useAsyncAction } from "@/hooks/use-async-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import { friendlyError } from "@/lib/error-message";

type SalesPreviewScope = "with_vda" | "all";

function filterPreviewPeople(rows: PersonVdaRow[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.allVdas.some((v) => v.includes(q)) ||
      p.codes.some(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.vdas.some((v) => v.includes(q))
      )
  );
}

/** เลือกเซลล์เพื่อเปิดมุมมองทดสอบ — scope เดียวกับที่เขา login จริง */
export function SalesPreviewPanel() {
  const router = useRouter();
  const {
    data: salesDirectory,
    loading: salesDirectoryLoading,
    error: salesDirectoryError,
  } = useVdaSalesDirectory(true);
  const [repSearch, setRepSearch] = useState("");
  const [repScope, setRepScope] = useState<SalesPreviewScope>("with_vda");
  const [previewError, setPreviewError] = useState("");

  const peopleWithVda = useMemo(
    () => getPeopleWithVda(salesDirectory),
    [salesDirectory]
  );

  const filteredReps = useMemo(() => {
    const base =
      repScope === "with_vda" ? peopleWithVda : (salesDirectory?.people ?? []);
    const filtered = filterPreviewPeople(base, repSearch);
    if (repScope === "all" && !repSearch.trim()) return filtered.slice(0, 50);
    return filtered;
  }, [salesDirectory, repSearch, repScope, peopleWithVda]);

  const salesPreviewAction = useAsyncAction(
    async (email: string, code?: string) => {
      setPreviewError("");
      const codeOnly =
        email.startsWith("__unmapped__:") ||
        email.startsWith("__code_preview__:");
      const res = await apiFetch(appPath("/api/auth/admin/preview-sales"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codeOnly && code ? { code } : { email, code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        // ไม่ใช้ alert() — บล็อก main thread และดูเหมือนแอปค้างบน webview
        setPreviewError(friendlyError(data?.error, "ไม่สามารถเปิดมุมมองทดสอบได้"));
        return;
      }
      router.push("/sales/orders");
    },
    { onError: (m) => setPreviewError(m) }
  );

  function startSalesPreview(email: string, code?: string) {
    salesPreviewAction.run(email, code);
  }

  return (
        <Card className="vmi-card-elevated">
          <CardHeader className="pb-3">
            <CardDescription>
              เลือกเซลล์เพื่อดูออเดอร์ที่เขาเห็น (scope เดียวกับ login จริง)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {salesDirectoryError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                โหลดข้อมูลไม่สำเร็จ: {salesDirectoryError}
              </p>
            )}
            {salesDirectory && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1",
                    salesDirectory.loaded?.salesmanMaster
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  )}
                >
                  cross_salesman:{" "}
                  {salesDirectory.loaded?.salesmanMaster ? "โหลดแล้ว" : "ยังไม่มี"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1",
                    salesDirectory.loaded?.vdaAosBill
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  )}
                >
                  ทะเบียน VDA:{" "}
                  {salesDirectory.loaded?.vdaAosBill
                    ? "โหลดแล้ว"
                    : "ยังไม่มี — sync หรือตั้ง VDA_SALESMAN_MAP"}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  มี VDA {salesDirectory.stats.peopleWithVda} คน ·{" "}
                  {salesDirectory.stats.withVdaAccess} รหัส
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="ค้นหารหัส / ชื่อ / อีเมล / VDA..."
                  value={repSearch}
                  onChange={(e) => setRepSearch(e.target.value)}
                />
              </div>
              {salesDirectory && (
                <div
                  role="group"
                  aria-label="กรองเซลล์"
                  className="flex shrink-0 rounded-xl border border-slate-200 p-1 dark:border-slate-700"
                >
                  <button
                    type="button"
                    onClick={() => setRepScope("with_vda")}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                      repScope === "with_vda"
                        ? "bg-violet-600 text-white shadow-sm dark:bg-violet-600"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    )}
                  >
                    มี VDA ({salesDirectory.stats.peopleWithVda})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepScope("all")}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                      repScope === "all"
                        ? "bg-slate-700 text-white shadow-sm dark:bg-slate-600"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    )}
                  >
                    ทั้งหมด ({salesDirectory.stats.totalPeople})
                  </button>
                </div>
              )}
            </div>
            <div className="vmi-scroll max-h-80 space-y-2 overflow-y-auto">
              {salesDirectoryLoading && (
                <p className="py-8 text-center text-sm text-slate-500">กำลังโหลด...</p>
              )}
              {!salesDirectoryLoading &&
                filteredReps.map((rep) => {
                  const previewCodes =
                    rep.codes.filter((c) => c.vdas.length > 0).length > 0
                      ? rep.codes.filter((c) => c.vdas.length > 0)
                      : rep.codes;

                  return (
                    <div
                      key={rep.email}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {rep.name}
                        </p>
                        {rep.unmapped && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                            ไม่พบใน cross_salesman
                          </span>
                        )}
                        {rep.multipleCodes && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                            หลายรหัส ({rep.codes.length})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {rep.unmapped
                          ? "ทดสอบด้วยรหัสเท่านั้น — ยังไม่มีอีเมลใน cross_salesman"
                          : rep.email}
                      </p>

                      {rep.multipleCodes ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            เลือกรหัสเพื่อดู VDA ที่รหัสนั้นดูแล
                          </p>
                          {previewCodes.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              className="flex w-full items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 dark:hover:border-indigo-700"
                              onClick={() => void startSalesPreview(rep.email, c.code)}
                            >
                              <div>
                                <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                                  {c.code}
                                </span>
                                {c.vdas.length > 0 ? (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {c.vdas.map((v) => (
                                      <span
                                        key={v}
                                        className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                                      >
                                        {v.toUpperCase()}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-0.5 text-xs text-slate-400">
                                    ไม่มี VDA ในทะเบียน
                                  </p>
                                )}
                              </div>
                              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                          onClick={() =>
                            void startSalesPreview(
                              rep.email,
                              previewCodes[0]?.code
                            )
                          }
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-teal-700 dark:text-teal-400">
                              {previewCodes[0]?.code ?? "—"}
                            </span>
                            {rep.allVdas.map((v) => (
                              <span
                                key={v}
                                className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                              >
                                {v.toUpperCase()}
                              </span>
                            ))}
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </button>
                      )}
                    </div>
                  );
                })}
              {!salesDirectoryLoading && filteredReps.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">
                  {repScope === "with_vda" && !repSearch.trim()
                    ? salesDirectory?.loaded?.vdaAosBill
                      ? "ไม่พบเซลล์ที่จับคู่ได้ — ลองกด「ทั้งหมด」หรือตรวจ VDA_CUSTOMER_MAP"
                      : "ยังไม่มีทะเบียน VDA — ตรวจ VDA_CUSTOMER_MAP และไฟล์ cross_target"
                    : "ไม่พบเซลล์"}
                </p>
              )}
            </div>
            {repScope === "all" && !repSearch.trim() && salesDirectory && (
              <p className="text-center text-xs text-slate-400">
                แสดง 50 คนแรก — ใช้ช่องค้นหาเพื่อหาเซลล์ที่ต้องการ
              </p>
            )}
            {previewError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {previewError}
              </p>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/sales/orders")}
            >
              ดูออเดอร์ทั้งหมด (ไม่จำกัด scope)
            </Button>
          </CardContent>
        </Card>
  );
}
