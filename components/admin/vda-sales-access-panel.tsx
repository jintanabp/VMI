"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PersonCodeAssignment {
  code: string;
  vdas: string[];
}

interface PersonRow {
  email: string;
  name: string;
  codes: PersonCodeAssignment[];
  allVdas: string[];
  multipleCodes: boolean;
  hasVdaAccess: boolean;
}

interface VdaRow {
  vda: string;
  salesmanCodes: string[];
  salesmen: Array<{ code: string; name: string; email: string }>;
  people: Array<{ email: string; name: string; codes: string[] }>;
}

interface DirectoryPayload {
  loaded: { salesmanMaster: boolean; vdaAosBill: boolean };
  people: PersonRow[];
  peopleWithVda?: PersonRow[];
  vdas: VdaRow[];
  vdasWithSalesman?: VdaRow[];
  stats: {
    totalSalesmen: number;
    withVdaAccess: number;
    withoutVdaAccess: number;
    totalPeople: number;
    peopleWithVda: number;
  };
}

type ViewMode = "person" | "vda";
type PersonScope = "with_vda" | "all";
type VdaScope = "with_salesman" | "all";

function filterPeople(rows: PersonRow[], query: string) {
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

function filterVdas(rows: VdaRow[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (v) =>
      v.vda.includes(q) ||
      v.salesmanCodes.some((c) => c.toLowerCase().includes(q)) ||
      v.people.some(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.codes.some((c) => c.toLowerCase().includes(q))
      )
  );
}

function CodeVdaList({ codes }: { codes: PersonCodeAssignment[] }) {
  const withVda = codes.filter((c) => c.vdas.length > 0);
  const withoutVda = codes.filter((c) => c.vdas.length === 0);
  return (
    <ul className="space-y-2">
      {withVda.map((c) => (
        <li key={c.code} className="text-xs">
          <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">
            {c.code}
          </span>
          <span className="text-slate-500 dark:text-slate-400"> → </span>
          <span className="inline-flex flex-wrap gap-1 align-middle">
            {c.vdas.map((v) => (
              <span
                key={`${c.code}-${v}`}
                className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
              >
                {v.toUpperCase()}
              </span>
            ))}
          </span>
        </li>
      ))}
      {withoutVda.map((c) => (
        <li key={c.code} className="text-xs text-slate-400">
          <span className="font-mono font-semibold text-slate-500">{c.code}</span>
          <span> — ไม่มี VDA ใน vda_aos_bill</span>
        </li>
      ))}
    </ul>
  );
}

export function VdaSalesAccessPanel() {
  const [data, setData] = useState<DirectoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("person");
  const [personScope, setPersonScope] = useState<PersonScope>("with_vda");
  const [vdaScope, setVdaScope] = useState<VdaScope>("with_salesman");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/admin/vda-sales")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => setData(payload))
      .finally(() => setLoading(false));
  }, []);

  const peopleWithVda = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data.peopleWithVda)) return data.peopleWithVda;
    return data.people.filter((p) => p.hasVdaAccess);
  }, [data]);

  const vdasWithSalesman = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data.vdasWithSalesman)) return data.vdasWithSalesman;
    return data.vdas.filter((v) => v.salesmanCodes.length > 0);
  }, [data]);

  const filteredPeople = useMemo(() => {
    const base =
      personScope === "with_vda" ? peopleWithVda : (data?.people ?? []);
    return filterPeople(base, query);
  }, [data, query, personScope, peopleWithVda]);

  const filteredVdas = useMemo(() => {
    const base = vdaScope === "with_salesman" ? vdasWithSalesman : (data?.vdas ?? []);
    return filterVdas(base, query);
  }, [data, query, vdaScope, vdasWithSalesman]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-slate-500">
          กำลังโหลดข้อมูลเซลล์ / VDA...
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-red-600">
          โหลดข้อมูลไม่สำเร็จ
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">เซลล์ ↔ VDA</CardTitle>
        <CardDescription>
          จัดกลุ่มตามคน (อีเมล) — 1 คนอาจมีหลายรหัสเซลล์ แต่ละรหัสดูแล VDA ต่างกัน
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={cn(
              "rounded-full px-2.5 py-1",
              data.loaded.salesmanMaster
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            )}
          >
            cross_salesman: {data.loaded.salesmanMaster ? "โหลดแล้ว" : "ยังไม่มี"}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1",
              data.loaded.vdaAosBill
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            )}
          >
            vda_aos_bill: {data.loaded.vdaAosBill ? "โหลดแล้ว" : "ยังไม่มี — ตั้ง VDA_AOS_LAKEHOUSE_ID"}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            มี VDA {data.stats.peopleWithVda} คน · {data.stats.withVdaAccess} รหัส
          </span>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหารหัส / ชื่อ / อีเมล / VDA..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view === "person" ? (
              <div
                role="group"
                aria-label="กรองคน"
                className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700"
              >
                <button
                  type="button"
                  onClick={() => setPersonScope("with_vda")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                    personScope === "with_vda"
                      ? "bg-violet-600 text-white shadow-sm dark:bg-violet-600"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  )}
                >
                  มี VDA ({data.stats.peopleWithVda})
                </button>
                <button
                  type="button"
                  onClick={() => setPersonScope("all")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                    personScope === "all"
                      ? "bg-slate-700 text-white shadow-sm dark:bg-slate-600"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  )}
                >
                  ทั้งหมด ({data.stats.totalPeople})
                </button>
              </div>
            ) : (
              <div
                role="group"
                aria-label="กรอง VDA"
                className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700"
              >
                <button
                  type="button"
                  onClick={() => setVdaScope("with_salesman")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                    vdaScope === "with_salesman"
                      ? "bg-violet-600 text-white shadow-sm dark:bg-violet-600"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  )}
                >
                  มีเซลล์ ({vdasWithSalesman.length})
                </button>
                <button
                  type="button"
                  onClick={() => setVdaScope("all")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                    vdaScope === "all"
                      ? "bg-slate-700 text-white shadow-sm dark:bg-slate-600"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  )}
                >
                  ทุก VDA ({data.vdas.length})
                </button>
              </div>
            )}
            <div
              role="group"
              aria-label="มุมมอง"
              className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700"
            >
              <button
                type="button"
                onClick={() => setView("person")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                  view === "person"
                    ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                ตามคน
              </button>
              <button
                type="button"
                onClick={() => setView("vda")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                  view === "vda"
                    ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                )}
              >
                ตาม VDA
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {view === "person"
            ? personScope === "with_vda"
              ? `แสดง ${filteredPeople.length} คนที่มี VDA`
              : `แสดง ${filteredPeople.length} จาก ${data.stats.totalPeople} คน`
            : vdaScope === "with_salesman"
              ? `แสดง ${filteredVdas.length} VDA ที่มีเซลล์`
              : `แสดง ${filteredVdas.length} จาก ${data.vdas.length} VDA`}
        </p>

        <div className="vmi-table-wrap">
          <div className="vmi-table-scroll max-h-[420px]">
            {view === "person" ? (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2.5">ชื่อ / อีเมล</th>
                    <th className="px-3 py-2.5">รหัสเซลล์ → VDA</th>
                    <th className="px-3 py-2.5">VDA รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPeople.map((p) => (
                    <tr
                      key={p.email}
                      className="border-t border-slate-100 align-top dark:border-slate-700/60"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {p.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{p.email}</p>
                        {p.multipleCodes && (
                          <span className="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            หลายรหัสเซลล์ ({p.codes.length})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <CodeVdaList codes={p.codes} />
                      </td>
                      <td className="px-3 py-2.5">
                        {p.allVdas.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.allVdas.map((v) => (
                              <span
                                key={v}
                                className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                              >
                                {v.toUpperCase()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredPeople.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-6 text-center text-slate-500"
                      >
                        {personScope === "with_vda"
                          ? "ไม่พบคนที่มี VDA — ตรวจ VDA_SALESMAN_MAP หรือ sync vda_aos_bill"
                          : "ไม่พบข้อมูล"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2.5">VDA</th>
                    <th className="px-3 py-2.5">เซลล์ที่ดูแล</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVdas.map((v) => (
                    <tr
                      key={v.vda}
                      className="border-t border-slate-100 align-top dark:border-slate-700/60"
                    >
                      <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100">
                        {v.vda.toUpperCase()}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {v.people.length > 0 ? (
                          <ul className="space-y-2">
                            {v.people.map((p) => (
                              <li key={p.email}>
                                <p className="font-semibold text-slate-800 dark:text-slate-200">
                                  {p.name}
                                </p>
                                <p className="text-slate-500">{p.email}</p>
                                <p className="mt-0.5">
                                  <span className="text-slate-500">รหัส </span>
                                  {p.codes.map((code, i) => (
                                    <span key={code}>
                                      {i > 0 && ", "}
                                      <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                                        {code}
                                      </span>
                                    </span>
                                  ))}
                                  {p.codes.length > 1 && (
                                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                                      (คนเดียวกัน หลายรหัส)
                                    </span>
                                  )}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400">
                            ไม่พบอีเมลใน cross_salesman
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredVdas.length === 0 && (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-3 py-6 text-center text-slate-500"
                      >
                        ไม่พบข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
