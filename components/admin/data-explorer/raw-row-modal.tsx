"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export interface RawRowDetail {
  /** เลขแถวที่คนอ่านเข้าใจ (1-based) — null สำหรับตารางฐานข้อมูล */
  rowNumber: number | null;
  headers: string[];
  cells: (string | number | boolean | null)[];
}

function display(v: string | number | boolean | null): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  return String(v);
}

/**
 * ดูทั้งแถวแบบแนวตั้ง
 *
 * ทางออกสุดท้ายที่รับประกันว่าอ่านค่าครบทุกตัวอักษรได้เสมอ ไม่ว่าคอลัมน์จะแคบแค่ไหน
 * หรือค่าจะยาวแค่ไหน และเป็นวิธีดูข้อมูลบนมือถือที่ตารางแนวนอนทำไม่ได้
 */
export function RawRowModal({
  row,
  onClose,
}: {
  row: RawRowDetail | null;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const copyAll = async () => {
    if (!row) return;
    const text = row.headers
      .map((h, i) => `${h}\t${display(row.cells[i] ?? null)}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: "คัดลอกทั้งแถวแล้ว" });
    } catch {
      toast({ tone: "error", title: "คัดลอกไม่สำเร็จ" });
    }
  };

  return (
    <Modal open={row != null} onClose={onClose} size="lg" sheetOnMobile>
      <ModalHeader>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
          {row?.rowNumber != null
            ? `แถวที่ ${row.rowNumber.toLocaleString()}`
            : "รายละเอียดแถว"}
        </h3>
      </ModalHeader>
      <ModalBody>
        {row && (
          <dl className="space-y-2">
            {row.headers.map((h, i) => {
              const raw = row.cells[i] ?? null;
              const text = display(raw);
              return (
                <div
                  key={`${h}-${i}`}
                  className="grid grid-cols-1 gap-0.5 border-b border-slate-100 pb-2 last:border-0 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3 dark:border-slate-800"
                >
                  <dt className="font-mono text-[11px] text-slate-500 sm:text-right dark:text-slate-400">
                    {h || `คอลัมน์ ${i + 1}`}
                  </dt>
                  <dd className="min-w-0 text-sm break-words whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                    {raw === null ? (
                      <span className="text-slate-400">— (ไม่มีค่า)</span>
                    ) : text === "" ? (
                      <span className="text-slate-400">— (ค่าว่าง)</span>
                    ) : (
                      text
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" size="sm" onClick={copyAll}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          คัดลอกทั้งแถว
        </Button>
        <Button size="sm" onClick={onClose}>
          ปิด
        </Button>
      </ModalFooter>
    </Modal>
  );
}
