"use client";

import { appPath } from "@/lib/paths";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Send,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  FreeGoodMobileCard,
  FreeGoodOrderTableRow,
} from "@/components/promo/free-good-subrow";
import { PromoDetailCell } from "@/components/promo/promo-detail-cell";
import {
  buildGroupMemberSkusMap,
  PromoGroupHeader,
} from "@/components/promo/promo-group-header";
import {
  StockDiscountPerCaseCell,
  StockNetPriceCell,
} from "@/components/stock/stock-price-cells";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CvdFlagCell } from "@/components/ui/cvd-flag-cell";
import { NoticeBanner } from "@/components/ui/notice-banner";
import {
  MobileRow,
  MobileRowExtra,
  MobileRowList,
  MobileRowStats,
  MobileStat,
} from "@/components/ui/mobile-row";
import type { StockRowComputed } from "@/lib/repositories/types";
import {
  calcLineAmount,
  calcNetUnitPrice,
  formatBaht,
  formatDays,
  formatNumber,
  getOrderCvdFlag,
  getPromoForQty,
  evaluatePriceOverride,
  resolveEffectivePrice,
  roundBaht,
  type CvdFlag,
  type CvdFlagReason,
  type PromoResult,
} from "@/lib/calculations";
import { cvdFlagHint } from "@/lib/stock/cvd-hint";
import { StorePriceInput } from "@/components/order/store-price-input";
import { StockQtyStepper } from "@/components/stock/stock-qty-stepper";
import { cn } from "@/lib/utils";
import {
  annotatePromoGroupStripes,
  promoGroupRowBgClass,
  sortRowsByPromoGroup,
  type PromoGroupStripe,
} from "@/lib/promo/promo-group-display";
import { isFreeGoodHostRow } from "@/lib/promo/stock-pooled-promo";

interface OrderLine {
  row: StockRowComputed;
  qty: number;
}

interface OrderPageClientProps {
  storeCode: string;
  storeName: string;
  storeAddress?: string;
  isVda?: boolean;
}

interface LineFreeGood {
  premiumProduct: string;
  premiumName: string;
  qty: number;
  unit: string;
  unitLabel: string;
  tierFromQty: number;
  tierPremiumQty: number;
  pooledQty: number;
  lineQty: number;
}

interface PromoApiLine extends PromoResult {
  skuCode: string;
  qty: number;
  unitPrice: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  priceExpired?: boolean;
  discountBaht?: number | null;
  discountPct?: number | null;
  freeGood?: LineFreeGood | null;
  pooledQty?: number;
  promoGroup?: string | null;
  promoGroupMembers?: number;
}

/** ราคาที่ร้านแก้เอง ต้องรอดข้ามการเด้งไป /stock แล้วกลับมา */
const PRICE_STORAGE_KEY = "vmi_order_price";

interface EnrichedLine {
  row: StockRowComputed;
  qty: number;
  cvdEst: number | null;
  flag: CvdFlag | null;
  /** เหตุผลของธง — ใช้เลือกข้อความอธิบาย และแยก "เตือน" ออกจาก "ควรยืนยันก่อนส่ง" */
  cvdReason: CvdFlagReason;
  /** true = ควรให้ยืนยันอีกครั้งก่อนส่ง (ไม่ใช่ห้ามส่ง) */
  cvdBlocking: boolean;
  promo: PromoResult;
  unitPrice: number | null;
  /** ราคาระบบก่อนร้านแก้ */
  c4UnitPrice: number | null;
  unitPriceOverride: number | null;
  priceMismatch: boolean;
  priceDiff: number | null;
  netUnitPrice: number | null;
  lineTotal: number | null;
  priceExpired: boolean;
  discountBaht?: number | null;
  discountPct?: number | null;
  freeGood: LineFreeGood | null;
  promoGroup?: string | null;
  promoGroupMembers?: number;
  pooledQty?: number;
  skuCode?: string;
  promoGroupStripe?: PromoGroupStripe | null;
  promoGroupIsFirst?: boolean;
}

export function OrderPageClient({
  storeCode,
  storeName,
  storeAddress,
  isVda = false,
}: OrderPageClientProps) {
  const router = useRouter();
  const [lines, setLines] = useState<OrderLine[]>([]);
  /** อ่าน draft จาก sessionStorage เสร็จแล้วหรือยัง — แยก "ยังโหลด" ออกจาก "โหลดแล้วว่าง" */
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** ยืนยันอีกครั้งเมื่อมีรายการที่จำนวนไม่เข้าเป้าหมาย — เตือน ไม่ใช่ห้ามส่ง */
  const [confirmRiskyOpen, setConfirmRiskyOpen] = useState(false);
  /** skuCode → ราคา/หีบ ที่ร้านพิมพ์เอง */
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>(
    {}
  );
  const [promoApi, setPromoApi] = useState<{
    lines: Record<string, PromoApiLine>;
    orderTotal: number | null;
  } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("vmi_order_draft");
    if (!raw) {
      router.replace("/stock");
      return;
    }
    try {
      const items = JSON.parse(raw) as StockRowComputed[];
      if (!Array.isArray(items) || items.length === 0) {
        router.replace("/stock");
        return;
      }
      let qtyBySku: Record<string, number> = {};
      try {
        const rawQty = sessionStorage.getItem("vmi_order_qty");
        if (rawQty) qtyBySku = JSON.parse(rawQty) as Record<string, number>;
      } catch {
        qtyBySku = {};
      }
      // ตัดราคาที่ค้างของ SKU ที่ไม่อยู่ใน draft นี้แล้วทิ้ง
      // ไม่งั้นราคาเก่าจะไปเกาะ SKU ที่ถูกลบแล้วเพิ่มกลับมาใหม่
      let priceBySku: Record<string, number> = {};
      try {
        const rawPrice = sessionStorage.getItem(PRICE_STORAGE_KEY);
        if (rawPrice) {
          const parsed = JSON.parse(rawPrice) as Record<string, number>;
          const codes = new Set(items.map((r) => r.skuCode));
          priceBySku = Object.fromEntries(
            Object.entries(parsed).filter(
              ([code, v]) =>
                codes.has(code) && Number.isFinite(v) && (v as number) >= 0
            )
          );
        }
      } catch {
        priceBySku = {};
      }
      setPriceOverrides(priceBySku);

      setLines(
        items.map((row) => ({
          row,
          // หน้าสต็อกเขียน qty ให้ทุกบรรทัดในดราฟต์เสมอ — fallback เป็น suggestOrder
          // จะปลุกตัวเลขที่ผู้ใช้ตั้งใจล้างทิ้งกลับขึ้นมา
          qty: qtyBySku[row.skuCode] ?? 0,
        }))
      );
      setReady(true);
    } catch {
      router.replace("/stock");
    }
  }, [router]);

  useEffect(() => {
    if (lines.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      void fetch(appPath("/api/promo/lookup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            skuCode: l.row.skuCode,
            qty: l.qty,
          })),
        }),
        signal: ctrl.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.lines) return;
          const bySku: Record<string, PromoApiLine> = {};
          for (const ln of data.lines as PromoApiLine[]) {
            bySku[ln.skuCode] = ln;
          }
          setPromoApi({
            lines: bySku,
            orderTotal: data.orderTotal ?? null,
          });
        })
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [lines]);

  function setPriceOverride(skuCode: string, price: number | null) {
    setPriceOverrides((prev) => {
      const next = { ...prev };
      if (price == null) delete next[skuCode];
      else next[skuCode] = roundBaht(price);
      return next;
    });
  }

  useEffect(() => {
    if (!ready) return;
    try {
      if (Object.keys(priceOverrides).length === 0) {
        sessionStorage.removeItem(PRICE_STORAGE_KEY);
      } else {
        sessionStorage.setItem(
          PRICE_STORAGE_KEY,
          JSON.stringify(priceOverrides)
        );
      }
    } catch {
      // sessionStorage ปิดอยู่ — ราคายังใช้ได้ในหน้านี้ แค่ไม่รอดข้ามหน้า
    }
  }, [priceOverrides, ready]);

  const enriched = useMemo(() => {
    return lines.map((line) => {
      // ใช้ตัวเดียวกับหน้า /stock — getOrderCvdFlag ยกเว้นเคส "ของหมด" และ "1 หีบคือขั้นต่ำ"
      // ให้ไม่ต้องกั้นการส่ง (เดิมหน้านี้เรียก getCvdFlag ดิบ จึงติดแดงแล้วส่งไม่ได้เลย)
      const cvd = getOrderCvdFlag(
        line.row.stock,
        line.qty,
        line.row.avgSales,
        line.row.minDays,
        line.row.maxDays
      );
      const cvdEst = cvd.cvdEst;
      const flag = cvd.flag;
      const api = promoApi?.lines[line.row.skuCode];
      const fallbackPromo = getPromoForQty(line.qty, line.row.promoTiers ?? []);
      /**
       * ผสม api กับ fallback แบบ "ยกกลุ่ม" ไม่ใช่ ?? รายฟิลด์
       *
       * เดิมพอ api มา fallback ถูกทิ้งทั้งก้อน — lookup ที่คืนแค่ขั้นปัจจุบันจึงลบ
       * ข้อความ "อีก X หีบ" ทิ้ง แต่ ?? รายฟิลด์ก็ผิดเพราะจะเอา nextPromo จาก api
       * ไปผสมกับ qtyToNext ของ fallback แล้วได้ตัวเลขที่ไม่ตรงกัน
       *
       * fallback คิดจาก tiers ของแถวเดียว ส่วนโปรกลุ่มคิดจากยอดรวมทั้งกลุ่ม
       * จึงห้ามใช้แทนกันเมื่อ SKU นี้อยู่ในกลุ่มโปร
       */
      const canFallback =
        !api?.promoGroup || (api.promoGroupMembers ?? 0) <= 1;
      const useApiNext = api?.nextPromo != null || !canFallback;
      const next = api && useApiNext ? api : fallbackPromo;
      const promo: PromoResult = api
        ? {
            currentPromo: api.currentPromo ?? fallbackPromo.currentPromo,
            currentKind: api.currentKind ?? fallbackPromo.currentKind,
            nextPromo: next.nextPromo,
            nextPromoQty: next.nextPromoQty,
            qtyToNext: next.qtyToNext,
            nextKind: next.nextKind,
            hasPromoLadder:
              api.hasPromoLadder ??
              (line.row.promoTiers?.length ?? 0) > 0,
          }
        : fallbackPromo;

      const c4UnitPrice = api?.unitPrice ?? line.row.unitPrice ?? null;
      const discountBaht =
        api?.discountBaht ?? line.row.discountBahtPerCase ?? null;
      const discountPct =
        api?.discountPct ?? line.row.discountPctPerCase ?? null;

      const override = priceOverrides[line.row.skuCode] ?? null;
      const verdict = evaluatePriceOverride({
        override,
        c4UnitPrice,
        promoLoaded: true,
      });
      const eff = resolveEffectivePrice({
        override,
        unitPrice: c4UnitPrice,
        discountBaht,
        discountPct,
      });

      const unitPrice = eff.unitPrice;
      // ไม่มี override → ใช้ค่าจาก API เหมือนเดิมทุกประการ (ออเดอร์ที่ไม่แก้ราคาต้องไม่เปลี่ยนพฤติกรรม)
      const netUnitPrice =
        override != null
          ? eff.netUnitPrice
          : (api?.netUnitPrice ??
            calcNetUnitPrice(c4UnitPrice, discountBaht, discountPct) ??
            line.row.netUnitPrice ??
            c4UnitPrice);
      const lineTotal =
        override != null
          ? calcLineAmount(line.qty, unitPrice, netUnitPrice)
          : (api?.lineTotal ??
            calcLineAmount(line.qty, c4UnitPrice, netUnitPrice));

      return {
        row: line.row,
        qty: line.qty,
        cvdEst,
        flag,
        cvdReason: cvd.reason,
        cvdBlocking: cvd.blocking,
        promo,
        unitPrice,
        c4UnitPrice,
        unitPriceOverride: verdict.override,
        priceMismatch: verdict.flagged,
        priceDiff: verdict.diff,
        netUnitPrice,
        lineTotal,
        priceExpired: api?.priceExpired ?? line.row.priceExpired ?? false,
        discountBaht,
        discountPct,
        freeGood: api?.freeGood ?? null,
        promoGroup: api?.promoGroup ?? line.row.promoGroup ?? null,
        promoGroupMembers:
          api?.promoGroupMembers ?? line.row.promoGroupMembers ?? 0,
        pooledQty: api?.pooledQty ?? line.qty,
      };
    });
  }, [lines, promoApi, priceOverrides]);

  const stats = useMemo(() => {
    const totalQty = enriched.reduce((s, l) => s + l.qty, 0);
    // blockingCount = ควรยืนยันก่อนส่ง / warnCount = เตือนเฉยๆ (ของหมด, 1 หีบขั้นต่ำ, เกินเพดานนิดหน่อย)
    const blockingCount = enriched.filter((l) => l.cvdBlocking).length;
    const warnCount = enriched.filter(
      (l) => !l.cvdBlocking && (l.flag === "red" || l.flag === "yellow")
    ).length;
    const withPromo = enriched.filter((l) => l.promo.currentPromo).length;
    const overriddenCount = enriched.filter(
      (l) => l.unitPriceOverride != null
    ).length;
    const mismatchCount = enriched.filter((l) => l.priceMismatch).length;
    // orderTotal จาก API คิดจากราคา master ไม่รู้จัก override — มี override เมื่อไหร่ต้องรวมเอง
    const orderTotal =
      overriddenCount > 0
        ? enriched.reduce((s, l) => s + (l.lineTotal ?? 0), 0)
        : (promoApi?.orderTotal ??
          enriched.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
    return {
      totalQty,
      blockingCount,
      warnCount,
      withPromo,
      overriddenCount,
      mismatchCount,
      skuCount: enriched.length,
      orderTotal: orderTotal > 0 ? orderTotal : null,
    };
  }, [enriched, promoApi]);

  const displayLines = useMemo(() => {
    const withGroup = enriched.map((line) => ({
      ...line,
      promoGroup: line.promoGroup ?? line.row.promoGroup ?? null,
      promoGroupMembers:
        line.promoGroupMembers ?? line.row.promoGroupMembers ?? 0,
      skuCode: line.row.skuCode,
    }));
    return annotatePromoGroupStripes(sortRowsByPromoGroup(withGroup));
  }, [enriched]);

  const promoStagedQty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const line of displayLines) {
      m[line.row.skuCode] = line.qty;
    }
    return m;
  }, [displayLines]);

  const groupMemberSkusMap = useMemo(
    () => buildGroupMemberSkusMap(displayLines),
    [displayLines]
  );

  /** รายการที่ธง CVD ผิดปกติ พร้อมคำอธิบายว่าทำไม — ใช้ในแบนเนอร์แทนข้อความรวมๆ เดิม */
  const cvdNotices = useMemo(
    () =>
      enriched
        .filter((l) => l.flag === "red" || l.cvdReason != null)
        .map((l) => ({
          skuCode: l.row.skuCode,
          skuName: l.row.skuName,
          blocking: l.cvdBlocking,
          hint: cvdFlagHint(l.flag ?? "red", l.cvdReason, l.row),
        })),
    [enriched]
  );

  /**
   * แก้จำนวนได้ในหน้านี้เลย ไม่ต้องเด้งกลับ /stock
   *
   * เดิมหน้านี้แก้ได้แค่ราคา พอจำนวนไม่เข้าเป้าหมายก็ต้องย้อนกลับไปหน้าสต็อก
   * ซึ่งเป็นต้นตอของบั๊ก "ติดธงแดงแล้วส่งไม่ได้" — ปุ่ม «แก้ที่สต็อก» ยังอยู่
   * สำหรับคนที่อยากไปดูบริบทสต็อกเต็ม ๆ
   */
  function setLineQty(skuCode: string, qty: number) {
    const next = lines.map((l) =>
      l.row.skuCode === skuCode
        ? { ...l, qty: Math.max(0, Math.floor(qty)) }
        : l
    );
    setLines(next);
    // เขียนกลับ session ทันที — หน้า /stock อ่านคีย์นี้ตอนกดย้อนกลับ
    try {
      const qtyMap: Record<string, number> = {};
      for (const l of next) qtyMap[l.row.skuCode] = l.qty;
      sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
      sessionStorage.setItem(
        "vmi_order_draft",
        JSON.stringify(next.map((l) => l.row))
      );
    } catch {
      // sessionStorage ปิดอยู่ — แก้ในหน้านี้ยังใช้ได้ แค่ไม่รอดข้ามหน้า
    }
  }

  function resetAllToSuggested() {
    // ไม่กรองแถวที่ได้ 0 ทิ้ง — ปุ่มนี้ "รีเซ็ตจำนวน" ไม่ใช่ "ลบรายการ"
    // (เดิมกรองทิ้ง ทำให้ทุกแถวหายพร้อมกันเมื่อ suggestOrder เป็น 0 หมด แล้วหน้าค้างที่ spinner)
    const next = lines.map((line) => ({
      ...line,
      qty: line.row.suggestOrder > 0 ? line.row.suggestOrder : 0,
    }));
    setLines(next);
    // รีเซ็ตจำนวน = รีเซ็ตราคาที่แก้ไว้ด้วย ไม่งั้นราคาเก่าจะค้างกับจำนวนใหม่
    setPriceOverrides({});
    try {
      sessionStorage.removeItem(PRICE_STORAGE_KEY);
    } catch {
      // ไม่มีอะไรต้องทำ
    }
    const qtyMap: Record<string, number> = {};
    for (const line of next) {
      qtyMap[line.row.skuCode] = line.qty;
    }
    sessionStorage.setItem("vmi_order_qty", JSON.stringify(qtyMap));
    sessionStorage.setItem(
      "vmi_order_draft",
      JSON.stringify(next.map((l) => l.row))
    );
  }

  function focusSkuOnStock(skuCode: string) {
    sessionStorage.setItem("vmi_focus_sku", skuCode);
    router.push("/stock");
  }

  /** เตือนสั่งซ้ำ — SKU ที่เพิ่งสั่งไปใน 14 วันและยังไม่ถูกปฏิเสธ */
  const { data: recentOrders } = useQuery<{
    days: number;
    bySku: Record<
      string,
      { totalQty: number; daysAgo: number; status: string; orderCount: number }
    >;
  }>({
    queryKey: ["order-history-recent"],
    queryFn: async () => {
      const res = await fetch(
        appPath("/api/store/order-history?summary=1&days=14"),
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("โหลดประวัติการสั่งไม่สำเร็จ");
      return res.json();
    },
    staleTime: 60_000,
  });

  const duplicateLines = useMemo(() => {
    const bySku = recentOrders?.bySku;
    if (!bySku) return [];
    return lines
      .map((line) => ({ line, info: bySku[line.row.skuCode] }))
      .filter(
        (x): x is { line: (typeof lines)[number]; info: NonNullable<typeof x.info> } =>
          x.info != null
      );
  }, [lines, recentOrders]);

  /** บรรทัดที่ส่งจริง — จำนวน 0 ส่งไม่ได้ (API บังคับ finalQty >= 1) */
  const submittableLines = useMemo(
    () => enriched.filter((l) => l.qty > 0),
    [enriched]
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(appPath("/api/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: submittableLines.map((l) => ({
            skuId: l.row.skuId,
            suggestedQty: l.row.suggestOrder,
            finalQty: l.qty,
            cvdEstimate: l.cvdEst,
            minDays: l.row.minDays,
            maxDays: l.row.maxDays,
            unitPriceOverride: l.unitPriceOverride,
          })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: unknown }
          | null;
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `ส่งคำสั่งซื้อไม่สำเร็จ (${res.status})`
        );
      }
      return res.json();
    },
    onSuccess: () => {
      sessionStorage.removeItem("vmi_order_draft");
      // เดิมลืมล้าง ทำให้จำนวนเก่ารั่วไปออเดอร์ถัดไป (stock-page-client อ่านคีย์นี้ตอน rehydrate)
      sessionStorage.removeItem("vmi_order_qty");
      sessionStorage.removeItem(PRICE_STORAGE_KEY);
      setSuccess(true);
    },
    onError: (err) => {
      setSubmitError(
        err instanceof Error ? err.message : "ส่งคำสั่งซื้อไม่สำเร็จ"
      );
    },
  });

  function submitOrder() {
    setSubmitError(null);
    submitMutation.mutate();
  }

  /**
   * จำนวนที่ไม่เข้าเป้าหมายเป็น "คำแนะนำ" ไม่ใช่ข้อห้าม — ให้ยืนยันอีกครั้งแล้วส่งได้
   * (เดิมปิดปุ่มทิ้งไว้ ทำให้ร้านที่ของหมดแล้วสั่ง 1 หีบ ส่งออเดอร์ไม่ได้เลย
   *  ทั้งที่หน้านี้ไม่มีช่องแก้จำนวนให้ปรับด้วยซ้ำ)
   */
  function requestSubmit() {
    if (stats.blockingCount > 0) {
      setConfirmRiskyOpen(true);
      return;
    }
    submitOrder();
  }

  if (success) {
    return (
      <PageShell>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="vmi-card-elevated max-w-md p-10 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">ส่งคำสั่งซื้อแล้ว</h2>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              คำสั่งซื้อของคุณถูกส่งไปยังเซลล์เพื่อตรวจสอบและอนุมัติ
            </p>
            <div className="mt-6 flex justify-center">
              <Button onClick={() => router.push("/stock")}>
                กลับหน้าสต็อก
              </Button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (lines.length === 0) {
    // โหลดเสร็จแล้วแต่ไม่มีรายการ = ทางตัน ต้องมีทางออกเสมอ ไม่ใช่ spinner หมุนค้าง
    if (ready) {
      return (
        <PageShell>
          <div className="flex min-h-screen items-center justify-center px-4">
            <div className="vmi-card-elevated max-w-md p-10 text-center">
              <h2 className="text-lg font-bold">ไม่มีรายการที่จะสั่ง</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                กลับไปเลือกสินค้าและใส่จำนวนที่หน้าสต็อกก่อน
              </p>
              <div className="mt-6 flex justify-center">
                <Button onClick={() => router.push("/stock")}>
                  <ArrowLeft className="h-4 w-4" />
                  กลับหน้าสต็อก
                </Button>
              </div>
            </div>
          </div>
        </PageShell>
      );
    }
    return (
      <PageShell>
        <div className="flex min-h-screen items-center justify-center text-slate-500 dark:text-slate-400">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="vmi-order-page pb-20">
      <AppHeader
        compact
        wide
        title={`ตรวจสอบคำสั่ง · ${storeCode.toUpperCase()}`}
        storeCode={storeCode}
        storeName={storeName}
        storeAddress={storeAddress}
        isVda={isVda}
        role="customer"
      />

      <main className="vmi-order-main mx-auto w-full min-w-0 max-w-none px-3 sm:px-4 lg:px-6">
        <div className="vmi-order-stats grid shrink-0 grid-cols-2 gap-1.5 py-2 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5 lg:py-3">
          <SummaryChip
            label="รายการ"
            value={`${stats.skuCount} SKU`}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <SummaryChip
            label="รวมสั่ง"
            value={`${stats.totalQty} หีบ`}
            highlight
          />
          {stats.orderTotal != null && (
            <SummaryChip
              label="มูลค่ารวม"
              value={formatBaht(stats.orderTotal)}
            />
          )}
          <SummaryChip
            label="ได้โปร"
            value={`${stats.withPromo} รายการ`}
            icon={<Sparkles className="h-4 w-4" />}
          />
          <SummaryChip
            label="ควรตรวจ"
            value={
              stats.blockingCount > 0
                ? `${stats.blockingCount} รายการ`
                : stats.warnCount > 0
                  ? `เตือน ${stats.warnCount} รายการ`
                  : "ไม่มี"
            }
            warn={stats.blockingCount > 0}
          />
        </div>

        <p className="mb-2 shrink-0 text-xs text-slate-500 dark:text-slate-400">
          ตรวจสอบรายการก่อนส่ง — แก้จำนวนและราคาได้ที่หน้านี้เลย
        </p>

        {/* กองแบนเนอร์เตือน — มีเพดานความสูง (globals.css .vmi-order-notices)
            เพราะตารางที่อยู่ข้างล่างเป็นลูกตัวเดียวที่ flex-1 ถ้าปล่อยให้แบนเนอร์
            ยาวตามจำนวนรายการ ตารางจะยุบจนกดแก้จำนวนไม่ได้ ซึ่งคือสิ่งที่คำเตือน
            บอกให้ไปทำพอดี */}
        <div className="vmi-order-notices vmi-scroll mb-2 flex shrink-0 flex-col gap-2 overflow-y-auto">
          {stats.mismatchCount > 0 && (
            <NoticeBanner
              tone="warn"
              title={
                <>
                  ราคา {stats.mismatchCount} รายการต่างจากราคาในระบบ —
                  ส่งได้ตามปกติ แต่เซลล์จะเห็นการแจ้งเตือนให้ตรวจสอบก่อนอนุมัติ
                </>
              }
            />
          )}

          {cvdNotices.length > 0 && (
            <NoticeBanner
              tone={stats.blockingCount > 0 ? "danger" : "warn"}
              title={
                <>
                  {cvdNotices.length} รายการจำนวนไม่เข้าเป้าหมาย —{" "}
                  {stats.blockingCount > 0
                    ? "ส่งได้ แต่จะให้ยืนยันอีกครั้ง"
                    : "ส่งได้ตามปกติ"}
                </>
              }
              items={cvdNotices.map((n) => ({
                key: n.skuCode,
                node: (
                  <span className="vmi-cell-text block">
                    <span className="font-mono font-semibold">{n.skuCode}</span>{" "}
                    {n.skuName} · {n.hint}
                  </span>
                ),
              }))}
              footer="ปรับจำนวนได้ที่ช่องในตารางนี้เลย"
            />
          )}

          {duplicateLines.length > 0 && (
            <NoticeBanner
              tone="warn"
              title={
                <>
                  {duplicateLines.length} รายการเคยสั่งไปแล้วใน{" "}
                  {recentOrders?.days ?? 14} วัน — ตรวจสอบก่อนส่งซ้ำ
                </>
              }
              items={duplicateLines.map(({ line, info }) => ({
                key: line.row.skuId,
                node: (
                  <span className="vmi-cell-text block">
                    <span className="font-mono font-semibold">
                      {line.row.skuCode}
                    </span>{" "}
                    {line.row.skuName} · สั่งไปแล้ว{" "}
                    {formatNumber(info.totalQty, 0)} หีบ เมื่อ{" "}
                    {info.daysAgo === 0
                      ? "วันนี้"
                      : `${formatNumber(info.daysAgo, 0)} วันก่อน`}
                    {info.status === "pending_approval" && " (ยังรออนุมัติ)"}
                  </span>
                ),
              }))}
              footer={
                <a
                  href={appPath("/history")}
                  className="font-semibold underline underline-offset-2"
                >
                  ดูประวัติการสั่งทั้งหมด
                </a>
              }
            />
          )}

          {submitError && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{submitError}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={submitOrder}
                disabled={submitMutation.isPending}
              >
                ลองใหม่
              </Button>
            </div>
          )}
        </div>

        <OrderSummaryList
          lines={displayLines}
          promoStagedQty={promoStagedQty}
          groupMemberSkusMap={groupMemberSkusMap}
          onFocusStock={focusSkuOnStock}
          onPriceChange={setPriceOverride}
          onQtyChange={setLineQty}
        />
      </main>

      <div className="vmi-action-bar">
        <div className="mx-auto flex w-full max-w-none items-center justify-between gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => router.push("/stock")}
            disabled={submitMutation.isPending}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">กลับหน้าสต็อก</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={resetAllToSuggested}
            disabled={submitMutation.isPending}
            title="รีเซ็ตจำนวนทุกรายการกลับเป็นที่แนะนำ"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden md:inline">รีเซ็ตเป็นจำนวนแนะนำ</span>
          </Button>
          <div className="min-w-0 flex-1 text-center text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              รวม {stats.totalQty} หีบ · {stats.skuCount} รายการ
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            disabled={
              submittableLines.length === 0 || submitMutation.isPending
            }
            title={
              submittableLines.length === 0
                ? "ยังไม่มีรายการที่จำนวนมากกว่า 0"
                : stats.blockingCount > 0
                  ? "มีรายการจำนวนไม่เข้าเป้าหมาย — กดแล้วจะให้ยืนยันก่อนส่ง"
                  : undefined
            }
            onClick={requestSubmit}
          >
            <Send className="h-4 w-4" />
            {submitMutation.isPending ? "กำลังส่ง..." : "ยืนยันส่ง"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRiskyOpen}
        tone="default"
        title="ยืนยันจำนวนที่สั่ง"
        body={
          <>
            มี {stats.blockingCount} รายการที่จำนวนยังไม่เข้าเป้าหมาย MIN/MAX
            <br />
            ส่งต่อไปให้พนักงานตรวจได้ — พนักงานจะเห็นธงเตือนนี้ด้วย
          </>
        }
        confirmLabel="ส่งคำสั่งซื้อ"
        onConfirm={() => submitOrder()}
        onClose={() => setConfirmRiskyOpen(false)}
      />
    </PageShell>
  );
}

/**
 * โปรที่ได้ต่อบรรทัด
 *
 * เดิมมี guard `currentPromo || freeGood || (hasPromoLadder && currentKind)` คร่อมไว้
 * ซึ่งเคสที่สำคัญที่สุด — "มีบันไดโปร ยังไม่ถึงขั้นแรก เหลืออีก 1 หีบ" — ตกทั้งสามข้อ
 * หน้าสต็อกจึงบอกว่า "อีก 1 หีบ ได้ส่วนลด 50" แต่หน้านี้ขึ้น "—" เฉย ๆ
 *
 * PromoDetailCell ตัดสินเรื่อง "ไม่มีอะไรจะบอก" เองอยู่แล้วและคืน "—" ให้
 * จึงไม่ต้องมีเงื่อนไขซ้ำที่นี่ (ซึ่งเป็นตัวที่ drift ออกจากกันมาตลอด)
 */
function OrderSummaryPromo({
  line,
  onQtyChange,
}: {
  line: EnrichedLine;
  onQtyChange: (skuCode: string, qty: number) => void;
}) {
  return (
    <PromoDetailCell
      variant="compact"
      currentPromo={line.promo.currentPromo}
      currentKind={line.promo.currentKind}
      nextPromo={line.promo.nextPromo}
      qtyToNext={line.promo.qtyToNext}
      nextPromoQty={line.promo.nextPromoQty}
      nextKind={line.promo.nextKind}
      hasPromoLadder={line.promo.hasPromoLadder}
      freeGood={line.freeGood}
      showFreeGoodChip={false}
      // ปลดล็อกบรรทัด "ซื้อครบ N หีบ …" กับชิป "N ขั้น" ที่หน้าสต็อกมีแต่หน้านี้ไม่มี
      tiers={line.row.promoTiers}
      endsInDays={line.row.currentPromoEndsInDays}
      onApplyNext={(qty) => onQtyChange(line.row.skuCode, qty)}
    />
  );
}

function OrderSummaryList({
  lines,
  promoStagedQty,
  groupMemberSkusMap,
  onFocusStock,
  onPriceChange,
  onQtyChange,
}: {
  lines: EnrichedLine[];
  promoStagedQty: Record<string, number>;
  groupMemberSkusMap: Map<string, string[]>;
  onFocusStock: (skuCode: string) => void;
  onPriceChange: (skuCode: string, price: number | null) => void;
  onQtyChange: (skuCode: string, qty: number) => void;
}) {
  return (
    <div className="vmi-table-wrap vmi-order-list-wrap min-h-0 flex-1">
      <div className="vmi-order-list-scroll vmi-table-scroll">
        <div className="lg:hidden">
          <MobileRowList grid>
            {lines.map((line, index) => {
              const showFreeGood = isFreeGoodHostRow(lines, index);
              return (
              <Fragment key={line.row.skuId}>
              <MobileRow
                className={promoGroupRowBgClass(line.promoGroupStripe ?? null)}
              >
                {line.promoGroupIsFirst &&
                  line.promoGroupStripe != null &&
                  line.promoGroup && (
                    <div className="mb-1.5">
                      <PromoGroupHeader
                        promoGroup={line.promoGroup}
                        stripe={line.promoGroupStripe}
                        hostSkuCode={line.row.skuCode}
                        memberSkus={
                          groupMemberSkusMap.get(line.promoGroup) ?? [
                            line.row.skuCode,
                          ]
                        }
                        stagedQty={promoStagedQty}
                        showPromoButton={false}
                      />
                    </div>
                  )}
                <div className="flex items-start gap-2">
                  <span className="w-5 shrink-0 pt-0.5 text-xs text-slate-400">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-teal-700 dark:text-teal-400">
                      {line.row.skuCode}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-slate-800 dark:text-slate-200">
                      {line.row.skuName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StockQtyStepper
                      qty={line.qty}
                      suggestOrder={line.row.suggestOrder}
                      onMinus={() =>
                        onQtyChange(line.row.skuCode, line.qty - 1)
                      }
                      onPlus={() => onQtyChange(line.row.skuCode, line.qty + 1)}
                      onSetQty={(n) => onQtyChange(line.row.skuCode, n)}
                      onApplySuggest={() =>
                        onQtyChange(line.row.skuCode, line.row.suggestOrder)
                      }
                      compact
                    />
                    <button
                      type="button"
                      onClick={() => onFocusStock(line.row.skuCode)}
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      <Pencil className="h-3 w-3" />
                      ดูที่สต็อก
                    </button>
                  </div>
                </div>
                <MobileRowStats className="pl-7">
                  <MobileStat
                    label="MIN / MAX"
                    value={`${line.row.minDays} / ${line.row.maxDays} วัน`}
                  />
                  <MobileStat label="ราคา/หีบ">
                    <StorePriceInput
                      value={line.unitPriceOverride}
                      c4UnitPrice={line.c4UnitPrice}
                      expired={line.priceExpired}
                      mismatch={line.priceMismatch}
                      diff={line.priceDiff}
                      onChange={(p) => onPriceChange(line.row.skuCode, p)}
                      compact
                    />
                  </MobileStat>
                  <MobileStat label="ส่วนลด">
                    <StockDiscountPerCaseCell
                      discountBaht={line.discountBaht}
                      discountPct={line.discountPct}
                      compact
                    />
                  </MobileStat>
                  <MobileStat label="ราคาสุทธิ/หีบ">
                    <StockNetPriceCell
                      unitPrice={line.unitPrice}
                      netUnitPrice={line.netUnitPrice}
                      expired={line.priceExpired}
                      compact
                    />
                  </MobileStat>
                  <MobileStat label="รวม" value={formatBaht(line.lineTotal)} />
                  <MobileStat label="CVD" value={formatDays(line.cvdEst)} />
                </MobileRowStats>
                <MobileRowExtra className="pl-7">
                  <OrderSummaryPromo line={line} onQtyChange={onQtyChange} />
                </MobileRowExtra>
              </MobileRow>
              {showFreeGood && line.freeGood && (
                <FreeGoodMobileCard freeGood={line.freeGood} />
              )}
              </Fragment>
              );
            })}
          </MobileRowList>
        </div>

        <table className="vmi-data-table vmi-order-table hidden w-full min-w-0 text-left lg:table">
          <thead className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {/* ตารางเป็น table-fixed — ความกว้างอ่านจากแถวนี้แถวเดียว และรวมได้ 100%
                พอต่ำกว่า xl คอลัมน์ MIN/MAX หายไป ที่เหลือจะขยายตามสัดส่วนเอง

                คอลัมน์ CVD ต้องกว้างพอสำหรับ "84.2 วัน" + ป้าย "ตรวจสอบ" ซึ่งเป็น
                whitespace-nowrap — แคบกว่านี้แล้วตัวเลขจะโดนตัดหัวเหลือ ".2 วัน" */}
            <tr>
              <th className="w-[3%] px-2 py-3">#</th>
              <th className="w-[7%] whitespace-nowrap px-2 py-3">SKU</th>
              <th className="w-[17%] px-2 py-3">ชื่อสินค้า</th>
              <th className="w-[10%] whitespace-nowrap px-2 py-3 text-right">
                จำนวน
              </th>
              <th
                className="hidden w-[6%] whitespace-nowrap px-2 py-3 text-right xl:table-cell"
                title="เป้าหมาย CVD ต่ำสุด / สูงสุด (วัน) ตามที่ตั้งในหน้าจัดการ"
              >
                MIN / MAX
              </th>
              <th className="w-[8%] whitespace-nowrap px-2 py-3 text-right">
                ราคา/หีบ
              </th>
              <th className="w-[5%] whitespace-nowrap px-2 py-3 text-right">
                ส่วนลด
              </th>
              <th className="w-[8%] whitespace-nowrap px-2 py-3 text-right">
                ราคาสุทธิ/หีบ
              </th>
              <th className="w-[8%] whitespace-nowrap px-2 py-3 text-right">
                รวม
              </th>
              <th className="w-[10%] whitespace-nowrap px-1.5 py-3 text-right">
                CVD
              </th>
              <th className="w-[18%] px-2 py-3">โปรที่ได้</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const showFreeGood = isFreeGoodHostRow(lines, index);
              return (
              <Fragment key={line.row.skuId}>
              {line.promoGroupIsFirst &&
                line.promoGroupStripe != null &&
                line.promoGroup && (
                  <tr className="border-t border-slate-100 dark:border-slate-800">
                    <td colSpan={11} className="px-2 pb-1.5 pt-2.5">
                      <PromoGroupHeader
                        promoGroup={line.promoGroup}
                        stripe={line.promoGroupStripe}
                        hostSkuCode={line.row.skuCode}
                        memberSkus={
                          groupMemberSkusMap.get(line.promoGroup) ?? [
                            line.row.skuCode,
                          ]
                        }
                        stagedQty={promoStagedQty}
                        showPromoButton={false}
                      />
                    </td>
                  </tr>
                )}
              <tr
                className={cn(
                  "border-t border-slate-100 dark:border-slate-800",
                  promoGroupRowBgClass(line.promoGroupStripe ?? null),
                  line.flag === "red" && "bg-red-50/70 dark:bg-red-950/25"
                )}
              >
                <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-teal-700 dark:text-teal-400">
                  {line.row.skuCode}
                </td>
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                  <span
                    className="vmi-cell-text line-clamp-2 block"
                    title={line.row.skuName}
                  >
                    {line.row.skuName}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="inline-flex flex-col items-end gap-0.5">
                    <StockQtyStepper
                      qty={line.qty}
                      suggestOrder={line.row.suggestOrder}
                      onMinus={() => onQtyChange(line.row.skuCode, line.qty - 1)}
                      onPlus={() => onQtyChange(line.row.skuCode, line.qty + 1)}
                      onSetQty={(n) => onQtyChange(line.row.skuCode, n)}
                      onApplySuggest={() =>
                        onQtyChange(line.row.skuCode, line.row.suggestOrder)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => onFocusStock(line.row.skuCode)}
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                      title="ไปดู SKU นี้ในหน้าสต็อก (ดูยอดขาย/โปรเต็ม ๆ)"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      ดูที่สต็อก
                    </button>
                  </div>
                </td>
                <td className="hidden px-2 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400 xl:table-cell">
                  {line.row.minDays} / {line.row.maxDays} วัน
                </td>
                <td className="px-2 py-2.5 text-right">
                  <StorePriceInput
                    value={line.unitPriceOverride}
                    c4UnitPrice={line.c4UnitPrice}
                    expired={line.priceExpired}
                    mismatch={line.priceMismatch}
                    diff={line.priceDiff}
                    onChange={(p) => onPriceChange(line.row.skuCode, p)}
                    compact
                  />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <StockDiscountPerCaseCell
                    discountBaht={line.discountBaht}
                    discountPct={line.discountPct}
                    compact
                  />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <StockNetPriceCell
                    unitPrice={line.unitPrice}
                    netUnitPrice={line.netUnitPrice}
                    expired={line.priceExpired}
                    compact
                  />
                </td>
                <td className="px-2 py-2.5 text-right text-xs font-medium tabular-nums">
                  {formatBaht(line.lineTotal)}
                </td>
                <td className="px-1.5 py-2.5 text-right">
                  <CvdFlagCell cvdEst={line.cvdEst} flag={line.flag} />
                </td>
                {/* max-w-0 คือสิ่งที่ทำให้ truncate ข้างใน PromoDetailCell ทำงานจริง
                    (เหมือนคอลัมน์โปรของหน้าสต็อก) — ไม่มีตัวนี้ข้อความโปรยาว ๆ
                    จะดันคอลัมน์บานแทนที่จะตัดด้วย … */}
                <td className="max-w-0 overflow-hidden px-3 py-2.5 align-top">
                  <div className="min-w-0">
                    <OrderSummaryPromo line={line} onQtyChange={onQtyChange} />
                  </div>
                </td>
              </tr>
              {showFreeGood && line.freeGood && (
                <FreeGoodOrderTableRow freeGood={line.freeGood} />
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  icon,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "vmi-stat-card !p-2.5 xl:!p-3",
        highlight && "ring-1 ring-teal-500/30",
        warn && "ring-1 ring-red-500/40"
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 xl:text-xs dark:text-slate-400">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold xl:mt-1 xl:text-lg",
          warn
            ? "text-red-600 dark:text-red-400"
            : "text-slate-900 dark:text-slate-100"
        )}
      >
        {value}
      </p>
    </div>
  );
}
