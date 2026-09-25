"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { appPath } from "@/lib/paths";
import { apiFetch } from "@/lib/api-fetch";

/**
 * ค้นหาสินค้าทั้งแคตตาล็อกจาก item_barcode_map_v2 — ใช้ตอนพนักงานเพิ่มสินค้าใหม่เข้าออเดอร์
 *
 * ต่างจากช่องค้นหาในหน้า /stock ตรงที่หน้านั้นค้นแค่ในสต็อกที่โหลดมาแล้วของร้านเดียว
 * (ร้านไม่เคยสต็อกจะหาไม่เจอ) ตัวนี้ค้นทั้งแคตตาล็อก ไม่ผูกกับร้านไหน — ก็อป UX มาจาก
 * CustomerCodePicker (ค้นหารหัสลูกค้าตอนลงทะเบียนคลัง VDA) ทั้งชุด
 */

export interface SkuHit {
  code: string;
  name: string;
  barcode: string;
  section: string;
  brand: string;
}

interface SearchResponse {
  results: SkuHit[];
  total: number;
  capped: boolean;
  notReady: boolean;
}

export function SkuPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (hit: SkuHit) => void;
}) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setInput("");
      setQ("");
      setData(null);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (!open || q.length < 2) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch(appPath(`/api/sales/sku-search?q=${encodeURIComponent(q)}&limit=20`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, q]);

  return (
    <Modal open={open} onClose={onClose} size="lg" sheetOnMobile>
      <ModalHeader>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
          ค้นหาสินค้า
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          พิมพ์รหัสสินค้า บาร์โค้ด ชื่อสินค้า หรือแบรนด์
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="เช่น 429001 / โคโดโม / 8850002014..."
            className="pl-9"
          />
        </div>

        {data?.notReady && (
          <NoticeBanner
            tone="warn"
            title="ยังไม่ได้โหลดข้อมูลสินค้า — ไปที่ ข้อมูล → Sync & สถานะ แล้วกดดึงข้อมูลก่อน"
          />
        )}

        {loading && <p className="py-4 text-center text-sm text-slate-500">กำลังค้น…</p>}

        {!loading && q.length >= 2 && data && !data.notReady && data.results.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            ไม่พบสินค้าที่ตรงกับ &quot;{q}&quot;
          </p>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {data?.results.map((hit) => (
            <button
              key={hit.code}
              type="button"
              onClick={() => onPick(hit)}
              className="block w-full px-1 py-2 text-left transition-colors hover:bg-teal-50/70 dark:hover:bg-teal-950/30"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                  {hit.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">
                  {hit.name || "(ไม่มีชื่อ)"}
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {[
                  hit.brand && `แบรนด์ ${hit.brand}`,
                  hit.section && `หมวด ${hit.section}`,
                  hit.barcode && `บาร์โค้ด ${hit.barcode}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </button>
          ))}
        </div>

        {data && data.results.length > 0 && (
          <p className="mt-3 text-center text-[11px] text-slate-400">
            {/* บอกจำนวนทั้งหมดเสมอ ไม่งั้นจะเข้าใจว่ามีอยู่แค่ที่เห็น */}
            แสดง {data.results.length} จาก {data.total.toLocaleString()} รายการ
            {data.capped && " (มากกว่านี้อีก)"}
            {data.total > data.results.length && " — พิมพ์ให้เจาะจงขึ้นเพื่อแคบผลลัพธ์"}
          </p>
        )}
      </ModalBody>
    </Modal>
  );
}
