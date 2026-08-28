"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { appPath } from "@/lib/paths";
import { apiFetch } from "@/lib/api-fetch";

/**
 * ค้นหารหัสลูกค้าจาก dim_customer
 *
 * ทะเบียนคลัง VDA ต้องการ "รหัสลูกค้า" ซึ่งไม่มีไฟล์ไหนในระบบบอกได้ว่าคลังไหนคือรหัสอะไร
 * (ชื่อใน dim_customer เป็นชื่อบริษัท ไม่มีคำว่า VDA สักราย) เดิมจึงต้องมีคนจำเลข 7 หลัก
 * มาก่อนถึงจะเพิ่มคลังใหม่ได้ — ตัวนี้ให้ค้นด้วยสิ่งที่คนจำได้จริง: ชื่อบริษัท จังหวัด
 * หรือเลขผู้เสียภาษี
 */

export interface CustomerHit {
  code: string;
  nameThai: string;
  nameEnglish: string;
  province: string;
  amphur: string;
  district: string;
  taxId: string;
  cusGroup: string;
  address: string;
}

interface SearchResponse {
  results: CustomerHit[];
  total: number;
  capped: boolean;
  notReady: boolean;
}

export function CustomerCodePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (hit: CustomerHit) => void;
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
    apiFetch(appPath(`/api/admin/customers/search?q=${encodeURIComponent(q)}&limit=20`))
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
          ค้นหารหัสลูกค้า
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          พิมพ์ชื่อบริษัท จังหวัด เลขผู้เสียภาษี หรือรหัสลูกค้า
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="เช่น บิ๊กบิซ / สงขลา / 3231847"
            className="pl-9"
          />
        </div>

        {data?.notReady && (
          <NoticeBanner
            tone="warn"
            title="ยังไม่ได้โหลด dim_customer — ไปที่ ข้อมูล → Sync & สถานะ แล้วกดดึงข้อมูลก่อน"
          />
        )}

        {loading && <p className="py-4 text-center text-sm text-slate-500">กำลังค้น…</p>}

        {!loading && q.length >= 2 && data && !data.notReady && data.results.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            ไม่พบลูกค้าที่ตรงกับ &quot;{q}&quot;
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
                  {hit.nameThai || hit.nameEnglish || "(ไม่มีชื่อ)"}
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {[
                  hit.province && `จ.${hit.province}`,
                  hit.amphur && `อ.${hit.amphur}`,
                  hit.cusGroup && `กลุ่ม ${hit.cusGroup}`,
                  hit.taxId && `เลขภาษี ${hit.taxId}`,
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
