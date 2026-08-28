"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Gift,
  Info,
  Layers,
  List,
  Package,
  Search,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { formatPromoTierLabel } from "@/lib/calculations";
import { appPath } from "@/lib/paths";
import type {
  PromoMonthGroup,
  PromoMonthReport,
  PromoMonthSku,
} from "@/lib/promo/promo-month";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import { friendlyError } from "@/lib/error-message";

/** ชื่อภาคแบบไทย — คีย์ตรงกับหัวคอลัมน์ภูมิภาคในไฟล์ C4 */
const REGION_LABEL: Record<string, string> = {
  COUNTRY: "ทั้งประเทศ",
  BANGKOK: "กทม.",
  CENTRAL: "ภาคกลาง",
  NORTHEAST: "ภาคอีสาน",
  NORTH: "ภาคเหนือ",
  SOUTH: "ภาคใต้",
};

type FilterKey =
  | "all"
  | "discount_baht"
  | "discount_pct"
  | "premium"
  | "no_benefit"
  | "missing_sku";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "discount_baht", label: "ส่วนลดบาท" },
  { key: "discount_pct", label: "ส่วนลด %" },
  { key: "premium", label: "ของแถม" },
  { key: "no_benefit", label: "ไม่มีสิทธิประโยชน์" },
  { key: "missing_sku", label: "ไม่มีใน SKU master" },
];

/**
 * เรนเดอร์ทีละกี่กลุ่ม
 *
 * ไฟล์จริงมี ~1,450 ถัง (86 กลุ่มจริง + ที่เหลือเป็นโปรเฉพาะสินค้าตัวเดียว)
 * กางหมดทีเดียวหน้าหนักโดยไม่มีใครได้อ่านครบ — เรียงกลุ่มที่ให้ประโยชน์จริงขึ้นก่อน
 * แล้วให้กดดูเพิ่ม พร้อมบอกตัวเลขว่าเหลืออีกเท่าไหร่ ไม่ตัดทิ้งเงียบ ๆ
 */
const PAGE_SIZE = 60;

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return month;
  return `${THAI_MONTHS[m - 1] ?? m} ${y + 543}`;
}

/** จำนวนเต็มไม่ใส่ทศนิยม เศษใส่ครบ 2 ตำแหน่ง — ให้คอลัมน์ส่วนลดตรงกับข้อความ "ลด 483.50 บาท/หีบ" */
function fmtBaht(n: number | null): string {
  if (n == null) return "—";
  const digits = Number.isInteger(n) ? 0 : 2;
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function matchesFilter(g: PromoMonthGroup, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "no_benefit":
      return !g.hasBenefit;
    case "missing_sku":
      return g.skus.some((s) => !s.inSkuMaster);
    default:
      return g.kinds.includes(filter);
  }
}

export function AdminPromoPanel() {
  const [data, setData] = useState<PromoMonthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  // เริ่มที่รายสินค้า — เป็นมุมมองที่ตรงกับแบบฟอร์มสั่งสินค้าที่ทีมเปิดเทียบทุกวัน
  // ส่วนมุมมองกลุ่มไว้ดูโครงสร้างขั้นบันไดตอนต้องเจาะ
  const [view, setView] = useState<"group" | "sku">("sku");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);
  /** คลังที่เลือกดู — "" = รวมทุกคลังที่มีสิทธิ์ */
  const [vda, setVda] = useState("");
  const [availableVdas, setAvailableVdas] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = vda ? `?vdaCode=${encodeURIComponent(vda)}` : "";
      const res = await apiFetch(appPath(`/api/promo/month${qs}`), {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          friendlyError(body?.error, `โหลดข้อมูลโปรไม่สำเร็จ (${res.status})`)
        );
      }
      const body = (await res.json()) as {
        availableVdas: string[];
        report: PromoMonthReport | null;
      };
      setAvailableVdas(body.availableVdas ?? []);
      setData(body.report);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "โหลดข้อมูลโปรไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [vda]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visibleGroups = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.groups.filter((g) => {
      if (!matchesFilter(g, filter)) return false;
      if (!q) return true;
      return (
        g.groupName.toLowerCase().includes(q) ||
        g.group.toLowerCase().includes(q) ||
        g.skus.some(
          (s) =>
            s.code.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q)
        )
      );
    });
  }, [data, search, filter]);

  /**
   * มุมมองรายสินค้า — เรียงตามรหัส SKU แบบเดียวกับแบบฟอร์มสั่งสินค้า
   *
   * SKU เดียวอาจอยู่หลายกลุ่ม (คนละ division|cusgroup) จึงเป็นหนึ่งแถวต่อ (SKU × กลุ่ม)
   * ไม่ยุบรวม — ไม่งั้นเงื่อนไขของอีกบริบทจะหายไปเงียบ ๆ
   *
   * ตัวกรองต้องลงถึงระดับแถวด้วย ไม่ใช่แค่ระดับกลุ่ม — เดิมค้นรหัสเดียว (426577)
   * แล้วได้สมาชิกทั้งกลุ่ม 17 ตัวที่ชื่อคล้ายกันหมด อ่านแล้วนึกว่าสินค้าตัวเดียว
   * มีหลายโปร ส่วนการค้นด้วยชื่อ/รหัสกลุ่มยังเห็นทั้งกลุ่มเหมือนเดิม
   */
  const visibleSkuRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = visibleGroups.flatMap((g) =>
      g.skus.map((s) => ({ sku: s, group: g }))
    );
    const filtered = q
      ? rows.filter(
          ({ sku, group }) =>
            sku.code.toLowerCase().includes(q) ||
            sku.name.toLowerCase().includes(q) ||
            group.group.toLowerCase().includes(q) ||
            group.groupName.toLowerCase().includes(q)
        )
      : rows;
    return filtered.sort((a, b) =>
      a.sku.code.localeCompare(b.sku.code, undefined, { numeric: true })
    );
  }, [visibleGroups, search]);

  // เปลี่ยนคำค้น/ตัวกรอง/มุมมอง = ชุดผลลัพธ์คนละชุด ต้องเริ่มนับหน้าใหม่
  useEffect(() => setLimit(PAGE_SIZE), [search, filter, view, data]);

  const shownGroups = visibleGroups.slice(0, limit);
  const shownSkuRows = visibleSkuRows.slice(0, limit);
  const hiddenCount =
    view === "group"
      ? visibleGroups.length - shownGroups.length
      : visibleSkuRows.length - shownSkuRows.length;

  /** กลุ่มที่อยู่ในเดือนนี้แต่วันนี้ยังใช้ไม่ได้ — ตัวเลขที่อธิบายว่าทำไมหน้าร้านเห็นน้อยกว่า */
  const inactiveGroups = (data?.groups ?? []).filter((g) => !g.activeNow).length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          value={data?.totals.groups ?? "—"}
          label="กลุ่มโปร"
        />
        <StatCard
          icon={<Package className="h-4 w-4" />}
          value={data?.totals.skus ?? "—"}
          label="SKU ที่มีแถวโปร"
          tone="teal"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          value={data?.totals.noBenefitRows ?? "—"}
          label="แถวไม่มีสิทธิประโยชน์"
          tone={(data?.totals.noBenefitRows ?? 0) > 0 ? "amber" : "default"}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          value={data?.totals.skusMissingFromMaster ?? "—"}
          label="SKU ที่ไม่มีใน master"
          tone={
            (data?.totals.skusMissingFromMaster ?? 0) > 0 ? "red" : "default"
          }
        />
      </div>

      {/* ตาราง C4 cash มีบริบทเดียวทั้งไฟล์ — มากกว่านั้นคือกำลังอ่านไฟล์ผิดใบอยู่
          (cft_promotion_credit.csv ตารางเก่ามี 7-8 ชุด) อาการที่คนเห็นคือ "ทำไมมีโปร
          Div. อื่นโผล่มา" ซึ่งชี้ไปที่ตัวกรอง ทั้งที่ต้นเหตุอยู่ที่ไฟล์ตั้งแต่แรก */}
      {data && data.fileContexts.length > 1 && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="mr-1 inline h-4 w-4 shrink-0" />
          ไฟล์โปรที่โหลดอยู่มี <b>{data.fileContexts.length} บริบท</b> (
          {data.fileContexts.join(", ")}) — ตาราง C4 cash ต้องมีชุดเดียว
          นี่คือลายนิ้วมือของ <b>cft_promotion_credit.csv</b> (ตารางเก่า)
          ตัวเลขในหน้านี้จึงยังไม่ใช่ของจริง — กด sync ที่หน้า
          &ldquo;ซิงก์ข้อมูล&rdquo; ให้ promotion_c4 ได้ 1,848 แถวก่อน
        </p>
      )}

      {/* คลังที่ค้นด้วยคีย์ที่ไม่มีในไฟล์ = ไม่เห็นโปรสักตัว และไม่มี error ที่ไหนเลย
          ต้นเหตุเกือบทุกครั้งคือ env ที่ตั้งทับไว้ (C4_VDA_DIVISION_MAP / C4_DEFAULT_*)
          ซึ่งชนะค่าที่โค้ดอ่านจากไฟล์เสมอ — ต้องบอกว่า "คลังไหน ใช้คีย์อะไร" ให้ครบ */}
      {data && data.contexts.some((c) => !c.inFile) && (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="mr-1 inline h-4 w-4 shrink-0" />
          คลังต่อไปนี้ค้นโปรด้วยบริบทที่{" "}
          <b>ไม่มีอยู่ในไฟล์ C4 เลย</b> จึงไม่เห็นโปรสักตัว:{" "}
          {data.contexts
            .filter((c) => !c.inFile)
            .map(
              (c) =>
                `${c.stores.join(", ") || "(ค่า default)"} → ${c.division}|${c.cusgroup}`
            )
            .join(" · ")}{" "}
          — ในไฟล์มี {data.fileContexts.join(", ") || "(ไม่มี)"} ·
          ตรวจ env <code>C4_VDA_DIVISION_MAP</code> /{" "}
          <code>C4_DEFAULT_DIVISION</code> / <code>C4_DEFAULT_CUSGROUP</code>{" "}
          (ถ้าไม่ตั้งไว้เลย ระบบจะอ่านบริบทจากไฟล์เองซึ่งถูกเสมอ)
        </p>
      )}

      {/* หน้านี้แสดงโปรทั้งเดือน ส่วนหน้าร้านแสดงเฉพาะที่ใช้ได้วันนี้ — ต่างกันโดยตั้งใจ
          แต่ถ้าไม่บอกไว้ตรงนี้ คนอ่านจะเหมาเอาว่าทุกแถวที่เห็นคือสิ่งที่ร้านได้ */}
      {inactiveGroups > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <b>{inactiveGroups.toLocaleString("th-TH")}</b> กลุ่มในเดือนนี้{" "}
          <b>ร้านยังไม่เห็น</b> เพราะช่วงวันที่ยังไม่เริ่มหรือหมดไปแล้ว —
          หน้านี้แสดงโปรทั้งเดือน ส่วนหน้าสต็อกและหน้าออเดอร์แสดงเฉพาะที่ใช้ได้วันนี้
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">
                {view === "group"
                  ? `กลุ่มโปร ${monthLabel(data?.month ?? "")} (${visibleGroups.length.toLocaleString("th-TH")})`
                  : `รายสินค้า ${monthLabel(data?.month ?? "")} (${visibleSkuRows.length.toLocaleString("th-TH")})`}
              </CardTitle>
              {/* แยกให้เห็นว่าเลขแต่ละตัวมาจากไหน — เดิมเขียน "N แถวจากไฟล์ C4"
                  ทั้งที่ N คือจำนวนหลังกรองแล้ว เทียบกับไฟล์จริงไม่ตรงเลย */}
              {/* ระบุให้ชัดว่าเลขไหนเป็นของทั้งไฟล์ เลขไหนกรองตามคลังที่เลือกแล้ว
                  — สองชุดนี้วางติดกัน ถ้าไม่บอกจะดูเหมือนตัวกรองคลังไม่ทำงาน */}
              <CardDescription>
                {data
                  ? `ทั้งไฟล์ ${data.totals.rowsInFile.toLocaleString("th-TH")} แถว · ทับซ้อนเดือนนี้ ${data.totals.rowsInMonth.toLocaleString("th-TH")} แถว · ใช้จริง${vda ? ` (${vda.toUpperCase()})` : ""} ${data.totals.rows.toLocaleString("th-TH")} แถว · ช่วง ${data.from} ถึง ${data.to}`
                  : "กำลังอ่านไฟล์โปร C4"}
              </CardDescription>

              {/* บอกตรง ๆ ว่าเราใช้ Div ไหน — ไฟล์ C4 มีของ Div อื่นปนมาด้วยและ
                  การ lookup ของหน้าร้านไม่แตะถึงเลย ถ้าไม่เขียนไว้ คนเปิดไฟล์เทียบ
                  จะเจอโปรที่ไม่มีในนี้แล้วนึกว่าระบบทำข้อมูลหาย */}
              {data && data.contexts.length > 0 && (
                <p className="mt-2 flex flex-wrap items-start gap-1.5 rounded-lg bg-teal-50 px-2 py-1.5 text-xs font-medium text-teal-900 ring-1 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-100 dark:ring-teal-900">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0">
                    ระบบเราใช้{" "}
                    <span className="font-bold">
                      Div.
                      {[...new Set(data.contexts.map((c) => c.division))].join(
                        " / "
                      )}
                    </span>{" "}
                    เท่านั้น (กลุ่มลูกค้า{" "}
                    {[...new Set(data.contexts.map((c) => c.cusgroup))].join(
                      " / "
                    )}{" "}
                    ·{" "}
                    {[...new Set(data.contexts.map((c) => c.region))].join(" / ")}{" "}
                    {data.contexts.flatMap((c) => c.stores).length > 0 && (
                      <>
                        {" "}
                        · {data.contexts.flatMap((c) => c.stores).join(", ")}
                      </>
                    )}
                    ) — โปรของ Div. อื่นในไฟล์ไม่ได้ใช้
                    {data.totals.rowsOtherContext > 0 && (
                      <>
                        {" "}
                        ตัดออก{" "}
                        {data.totals.rowsOtherContext.toLocaleString("th-TH")} แถว
                      </>
                    )}
                    {/*
                      คลังคนละรหัสแต่บริบทเดียวกัน (เช่น vda1 กับ vda3 ที่อยู่
                      BANGKOK เหมือนกัน) จะได้โปรชุดเดียวกันเป๊ะ ถ้าไม่เขียนไว้
                      ผู้ใช้สลับคลังแล้วเห็นตัวเลขเท่าเดิมจะนึกว่าตัวกรองพัง
                    */}
                    {vda && (
                      <>
                        {" "}
                        <span className="text-teal-700/80 dark:text-teal-200/80">
                          · คลังอื่นที่อยู่บริบทเดียวกันนี้จะเห็นโปรชุดเดียวกัน
                          ตัวเลขจึงเท่ากันได้
                        </span>
                      </>
                    )}
                  </span>
                </p>
              )}

              {/* สรุปรายภาค — ตอบคำถาม "เดือนนี้ต้นทางส่งโปรเฉพาะภาคมาไหม ภาคไหนได้"
                  นับจากไฟล์ทั้งใบโดยไม่กรองด้วยบริบทของคลัง ถ้ากรองก่อน ภาคที่ยังไม่มี
                  คลังจะเป็น 0 เสมอ แล้วแยกไม่ออกว่า "ต้นทางไม่ส่ง" หรือ "จับคู่ไม่ติด" */}
              {data && data.regions.some((r) => r.rows > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">
                    โปรตามภาคเดือนนี้:
                  </span>
                  {data.regions
                    .filter((r) => r.rows > 0)
                    .map((r) => {
                      const ours = r.stores.length > 0;
                      return (
                        <span
                          key={r.region}
                          title={
                            (ours ? `คลังของเรา: ${r.stores.join(", ")}\n` : "") +
                            `${r.rows} แถวติดภาคนี้ · ให้ส่วนลด/ของแถมจริง ${r.rowsWithBenefit} แถว · ${r.skus} SKU`
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1",
                            ours
                              ? "bg-teal-50 text-teal-900 ring-teal-300 dark:bg-teal-950/40 dark:text-teal-100 dark:ring-teal-800"
                              : "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700"
                          )}
                        >
                          <span className="font-semibold">
                            {REGION_LABEL[r.region] ?? r.region}
                          </span>
                          <span className="tabular-nums">
                            {r.rowsWithBenefit.toLocaleString("th-TH")}/
                            {r.rows.toLocaleString("th-TH")}
                          </span>
                        </span>
                      );
                    })}
                  <span className="text-slate-400">
                    (ให้ประโยชน์จริง/ทั้งหมด · เขียว = มีคลังของเราอยู่ภาคนั้น ·
                    นับจากทั้งไฟล์ ไม่กรองตามคลังที่เลือก)
                  </span>
                </div>
              )}
            </div>
            {/* สลับมุมมอง — "รายสินค้า" จัดคอลัมน์ให้ตรงกับแบบฟอร์มสั่งสินค้าที่ทีมใช้จริง
                จะได้เทียบกับไฟล์ที่ส่งให้ร้านได้บรรทัดต่อบรรทัด */}
            <div className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  { key: "sku", label: "รายสินค้า", icon: List },
                  { key: "group", label: "กลุ่มโปร", icon: Layers },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    view === key
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/*
            เลือกดูโปรรายคลัง — โปรผูกกับบริบท (division, cusgroup, region) ของแต่ละคลัง
            และ region ต่างกันได้จริง คลังคนละภาคจึงได้โปรคนละชุด
            รวมทุกคลังไว้ด้วยกันจะแยกไม่ออกว่าโปรไหนเป็นของคลังไหน
          */}
          {availableVdas.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="promo-vda"
                className="text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                ดูโปรของคลัง
              </label>
              <select
                id="promo-vda"
                value={vda}
                onChange={(e) => setVda(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">ทุกคลัง ({availableVdas.length})</option>
                {availableVdas.map((v) => (
                  <option key={v} value={v}>
                    {v.toUpperCase()}
                  </option>
                ))}
              </select>
              {vda && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  แสดงเฉพาะโปรที่คลัง {vda.toUpperCase()} ได้รับจริง
                </span>
              )}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="ค้นหารหัส SKU / ชื่อสินค้า / ชื่อกลุ่มโปร..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  filter === f.key
                    ? "bg-[#0f4c75] text-white shadow-sm dark:bg-[#1a6b9a]"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading && <p className="text-sm text-slate-500">กำลังโหลด...</p>}

          {!loading && visibleGroups.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              ไม่มีโปรที่ตรงกับเงื่อนไขนี้ในเดือน{" "}
              {monthLabel(data?.month ?? "")}
            </p>
          )}

          {view === "group" ? (
            <div className="space-y-2">
              {shownGroups.map((g) => (
                <PromoGroupCard
                  key={g.key}
                  group={g}
                  open={expanded.has(g.key)}
                  onToggle={() => toggle(g.key)}
                />
              ))}
            </div>
          ) : (
            <PromoSkuTable rows={shownSkuRows} />
          )}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/60"
            >
              แสดงเพิ่ม — ยังเหลืออีก {hiddenCount.toLocaleString("th-TH")}{" "}
              {view === "group" ? "กลุ่ม" : "รายการ"}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * มุมมองรายสินค้า — คอลัมน์เรียงตามแบบฟอร์มสั่งสินค้าที่ทีมส่งให้ร้าน
 * (# / Name / ราคา/หีบ / ส่วนลด / ราคา / รายการโปรโมชั่น C4 VDA)
 * เพื่อให้เทียบกับไฟล์นั้นได้บรรทัดต่อบรรทัดโดยไม่ต้องแปลงในหัว
 */
function PromoSkuTable({
  rows,
}: {
  rows: { sku: PromoMonthSku; group: PromoMonthGroup }[];
}) {
  return (
    // .vmi-table-wrap เป็น overflow:hidden — ต้องมีตัวเลื่อนคั่น ไม่งั้นคอลัมน์ท้ายโดนตัด
    <div className="vmi-table-wrap">
      <div className="vmi-scroll overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
              <th className="w-10 px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Name</th>
              <th className="w-24 px-2 py-2 text-right font-semibold">
                ราคา/หีบ
              </th>
              {/* สองคอลัมน์นี้เป็น "ถ้าซื้อครบขั้น" ไม่ใช่ "ตอนนี้ได้เท่านี้" — หัวคอลัมน์เดิม
                  เขียนแค่ "ส่วนลด/ราคา" ทำให้อ่านได้ว่าร้านจ่ายราคานี้เลย แล้วพอหน้าสต็อก
                  โชว์ราคาเต็ม (เพราะยังไม่ได้ใส่จำนวน) ก็ดูเหมือนสองหน้าขัดกัน ทั้งที่ถูกทั้งคู่ */}
              <th className="w-28 px-2 py-2 text-right font-semibold">
                ส่วนลด
                <span className="block font-normal text-[10px] leading-tight text-slate-400">
                  ถ้าซื้อครบขั้น
                </span>
              </th>
              <th className="w-28 px-2 py-2 text-right font-semibold">
                ราคา
                <span className="block font-normal text-[10px] leading-tight text-slate-400">
                  หลังลดขั้นแรก
                </span>
              </th>
              {/* กลุ่มเดียวกันมีได้หลายช่วง (โปรแทรกบางเดือน) — ต้องเห็นว่าอันไหนใช้เมื่อไหร่ */}
              <th className="w-36 px-2 py-2 font-semibold">ช่วงที่ใช้ได้</th>
              {/* C4 ของเราคือตาราง cash (cft_promotion_cash.csv) ไม่ใช่ credit —
                  แบบฟอร์มเก่าเขียนหัวคอลัมน์เป็น Credit ไว้ ที่นี่ใช้ชื่อให้ตรงต้นทาง
                  ไม่ใส่ Div. ตายตัวที่หัวตาราง เพราะเดิมอ่านจากแถวแรกแถวเดียวแล้วเหมา
                  ทั้งตาราง พอมีหลาย division ปนมาจะติดป้ายผิดทันที */}
              <th className="px-2 py-2 font-semibold">
                รายการโปรโมชั่น C4 VDA (Cash)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sku, group }, i) => (
              <tr
                key={`${group.key}|${sku.code}`}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="px-2 py-2 tabular-nums text-slate-400">
                  {i + 1}
                </td>
                <td className="px-2 py-2">
                  <span className="vmi-cell-text">
                    <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                      [{sku.code}]
                    </span>{" "}
                    {sku.name}
                  </span>
                  {!sku.inSkuMaster && (
                    <span
                      className="ml-1 whitespace-nowrap font-semibold text-red-600 dark:text-red-400"
                      title="ไม่มีใน SKU master (item_barcode_map) — ไม่มีแถวสินค้าให้แสดงโปรในหน้าสต็อก"
                    >
                      (ไม่มีใน master)
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {fmtBaht(sku.unitPrice)}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-2 py-2 text-right tabular-nums",
                    group.activeNow
                      ? "text-orange-600 dark:text-orange-400"
                      : "text-slate-400 line-through dark:text-slate-500"
                  )}
                  title={
                    group.activeNow
                      ? "ส่วนลดที่ได้เมื่อซื้อครบขั้นแรก"
                      : "ช่วงนี้ไม่ได้ใช้อยู่ ณ วันนี้ — หน้าร้านจะไม่เห็นส่วนลดนี้"
                  }
                >
                  {sku.discountBaht != null
                    ? fmtBaht(sku.discountBaht)
                    : sku.discountPct != null
                      ? `${sku.discountPct}%`
                      : ""}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-2 py-2 text-right tabular-nums",
                    group.activeNow
                      ? "font-semibold"
                      : "text-slate-400 line-through dark:text-slate-500"
                  )}
                >
                  {fmtBaht(sku.netPrice ?? sku.unitPrice)}
                </td>
                <td className="whitespace-nowrap px-2 py-2 tabular-nums text-slate-500">
                  {group.fromDate ? (
                    <>
                      {group.fromDate} – {group.toDate}
                      {!group.activeNow && (
                        <span
                          className="ml-1 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          title="ช่วงนี้ไม่ได้ใช้อยู่ ณ วันนี้ — หน้าร้านจะไม่เห็นโปรนี้"
                        >
                          ร้านยังไม่เห็น
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-2">
                  <span className="vmi-cell-text">
                    {group.promoLabel || (
                      <span className="text-amber-700 dark:text-amber-400">
                        ไม่มีสิทธิประโยชน์
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-slate-500">
                  ไม่มีรายการ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PromoGroupCard({
  group: g,
  open,
  onToggle,
}: {
  group: PromoMonthGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const missing = g.skus.filter((s) => !s.inSkuMaster).length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform",
            !open && "-rotate-90"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <span className="min-w-0 break-words">{g.groupName || "—"}</span>
            {/* ~65 กลุ่มใน cft_assorted_mapping ไม่มีคำอธิบาย labelFor จึงคืนรหัสกลุ่มมา
                แสดงป้ายรหัสซ้ำอีกทีเป็นแค่ noise — โชว์เฉพาะตอนที่ชื่อกับรหัสไม่เหมือนกัน */}
            {g.group && g.group !== g.groupName && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {g.group}
              </span>
            )}
            {!g.hasBenefit && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                ไม่มีสิทธิประโยชน์
              </span>
            )}
            {missing > 0 && (
              <span
                className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300"
                title="สินค้าเหล่านี้ไม่มีใน SKU master จึงไม่มีแถวให้แสดงในหน้าสต็อก ต่อให้ C4 มีโปร"
              >
                {missing} SKU ไม่มีใน master
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {g.headline}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {g.skus.length} SKU · {g.rowCount} แถว · {g.division}|{g.cusgroup}
            {g.fromDate && ` · ${g.fromDate} ถึง ${g.toDate}`}
            {g.fromDate && !g.activeNow && (
              <span className="ml-1 font-semibold text-amber-700 dark:text-amber-400">
                · ยังไม่ถึง/หมดแล้ว
              </span>
            )}
          </p>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              ขั้นบันได
            </p>
            {/* .vmi-table-wrap เป็น overflow:hidden — ต้องมีตัวเลื่อนคั่น
                ไม่งั้นตารางที่กว้างกว่าการ์ดจะโดนตัดขอบขวาและเลื่อนไปดูไม่ได้ */}
            <div className="vmi-table-wrap">
              <div className="vmi-scroll overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                      <th className="px-2 py-2 font-semibold">ซื้อ (หีบ)</th>
                      <th className="px-2 py-2 font-semibold">สิทธิประโยชน์</th>
                      <th className="px-2 py-2 text-right font-semibold">
                        ขั้นต่ำ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.tiers.map((t) => (
                      <tr
                        key={t.minQty}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="whitespace-nowrap px-2 py-2 font-medium">
                          {t.minQty}+
                        </td>
                        <td className="px-2 py-2">
                          {t.kind === "premium" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                              <Gift className="h-3 w-3 shrink-0" />
                              <span className="vmi-cell-text">
                                {formatPromoTierLabel(t)}
                              </span>
                            </span>
                          ) : (
                            <span className="vmi-cell-text">
                              {formatPromoTierLabel(t) || "—"}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-500">
                          {/* ไฟล์ประกาศ MINIMUMPURCHASE แยกจาก from/to และบางกลุ่มไม่ตรงกัน
                              ระบบยังไม่บังคับใช้ ตัวเลขนี้จึงเป็นข้อมูลให้คนตัดสินใจ */}
                          {g.minPurchase > 0 ? g.minPurchase : "—"}
                        </td>
                      </tr>
                    ))}
                    {g.tiers.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-2 py-3 text-center text-slate-500"
                        >
                          ไม่มีขั้นบันไดที่ให้ส่วนลดหรือของแถม
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              สินค้าในกลุ่ม ({g.skus.length})
            </p>
            <ul className="space-y-1 text-xs">
              {g.skus.map((s) => (
                <li
                  key={s.code}
                  className="flex items-start gap-2 text-slate-600 dark:text-slate-300"
                >
                  <span className="shrink-0 font-mono font-semibold text-teal-700 dark:text-teal-400">
                    {s.code}
                  </span>
                  <span className="vmi-cell-text min-w-0 flex-1">{s.name}</span>
                  {!s.inSkuMaster && (
                    <span
                      className="shrink-0 font-semibold text-red-600 dark:text-red-400"
                      title="ไม่มีใน SKU master (item_barcode_map) — ไม่มีแถวสินค้าให้แสดงโปรในหน้าสต็อก"
                    >
                      ไม่มีใน master
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
