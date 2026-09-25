"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarX2, FileX2, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { NotifyStoreCheckbox } from "@/components/sales/notify-store-checkbox";
import { cn } from "@/lib/utils";

export interface MonthEndOrder {
  id: string;
  label: string;
  createdAt: string;
  skuCodes: string[];
}

type Mode = "orders" | "sku";

/**
 * เคลียร์สิ้นเดือน — รวมสองแบบไว้ในกล่องเดียว (เดิมกระจายอยู่ในแถบซ้าย: ช่องเคลียร์ SKU
 * กับปุ่มที่โผล่เฉพาะตอนติ๊กออเดอร์ หาไม่เจอ)
 *
 * - ทั้งใบ: ลิสต์ออเดอร์รออนุมัติที่เห็นอยู่ ติ๊กไว้ครบเป็นค่าเริ่มต้น เอาออกได้
 * - เฉพาะสินค้า: ลบ SKU นั้นจากทุกออเดอร์รออนุมัติที่ดูแล (ใบที่ไม่เหลือรายการถูกลบทั้งใบ)
 *
 * ทั้งสองแบบข้ามใบที่ออก PO แล้วเสมอ (ฝั่ง server บังคับ)
 */
export function MonthEndClearModal({
  open,
  onClose,
  orders,
  busy,
  onClearOrders,
  onClearSku,
}: {
  open: boolean;
  onClose: () => void;
  /** ออเดอร์รออนุมัติตามตัวกรองที่เห็นอยู่ */
  orders: MonthEndOrder[];
  busy: boolean;
  onClearOrders: (orderIds: string[], notify: boolean) => Promise<void>;
  onClearSku: (skuCode: string, notify: boolean) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("orders");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sku, setSku] = useState("");
  const [notify, setNotify] = useState(true);

  // เปิดกล่องใหม่ = เริ่มจากติ๊กครบทุกใบที่เห็น · ชุดออเดอร์เปลี่ยน (เช่นเพิ่งสลับตัวกรองมา
  // "รออนุมัติ" แล้วลิสต์เพิ่งโหลดเสร็จ) ก็ติ๊กครบใหม่ — ไม่รีเซ็ตแค่เพราะ refetch ได้ชุดเดิม
  const orderKey = orders.map((o) => o.id).join(",");
  useEffect(() => {
    if (!open) return;
    setPicked(new Set(orderKey ? orderKey.split(",") : []));
  }, [open, orderKey]);
  useEffect(() => {
    if (!open) return;
    setMode("orders");
    setSku("");
    setNotify(true);
  }, [open]);

  const skuCode = sku.trim();
  const skuHits = useMemo(
    () => (skuCode ? orders.filter((o) => o.skuCodes.includes(skuCode)) : []),
    [orders, skuCode]
  );

  const allPicked = orders.length > 0 && picked.size === orders.length;
  const canConfirm = mode === "orders" ? picked.size > 0 : skuCode.length > 0;

  async function confirm() {
    if (mode === "orders") await onClearOrders([...picked], notify);
    else await onClearSku(skuCode, notify);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} size="lg" sheetOnMobile labelledBy="month-end-title">
      <ModalHeader>
        <h3
          id="month-end-title"
          className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-50"
        >
          <CalendarX2 className="h-5 w-5 text-red-600" />
          เคลียร์สิ้นเดือน
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          ลบออเดอร์ที่ยังรออนุมัติออกจากระบบ · ใบที่ออก PO แล้วจะถูกข้ามเสมอ · ย้อนกลับไม่ได้
        </p>
      </ModalHeader>

      <ModalBody className="space-y-3">
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              {
                value: "orders",
                icon: FileX2,
                title: "เคลียร์ทั้งใบ",
                desc: "เลือกออเดอร์ที่จะลบทั้งใบ",
              },
              {
                value: "sku",
                icon: PackageX,
                title: "เคลียร์เฉพาะสินค้า",
                desc: "ลบสินค้าตัวเดียวออกจากทุกออเดอร์",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={mode === opt.value}
              onClick={() => setMode(opt.value)}
              className={cn(
                "flex items-start gap-2 rounded-xl border p-3 text-left transition-colors",
                mode === opt.value
                  ? "border-red-300 bg-red-50 ring-1 ring-red-300 dark:border-red-800 dark:bg-red-950/30"
                  : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
              )}
            >
              <opt.icon className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {opt.title}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {mode === "orders" ? (
          orders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              ไม่มีออเดอร์รออนุมัติในรายการที่แสดงอยู่
            </p>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700">
              <label className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-semibold dark:border-slate-800">
                <Checkbox
                  checked={allPicked}
                  onCheckedChange={() =>
                    setPicked(allPicked ? new Set() : new Set(orders.map((o) => o.id)))
                  }
                />
                เลือกทั้งหมด ({picked.size}/{orders.length} ใบ)
              </label>
              <ul className="vmi-scroll max-h-64 overflow-y-auto">
                {orders.map((o) => (
                  <li key={o.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <Checkbox
                        checked={picked.has(o.id)}
                        onCheckedChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(o.id)) next.delete(o.id);
                            else next.add(o.id);
                            return next;
                          })
                        }
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-100">{o.label}</span>
                      <span className="ml-auto text-xs tabular-nums text-slate-500">
                        {o.skuCodes.length} SKU ·{" "}
                        {new Date(o.createdAt).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                <NotifyStoreCheckbox checked={notify} onChange={setNotify} />
              </div>
            </div>
          )
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              รหัสสินค้า
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="เช่น 429001"
                className="mt-1 max-w-xs font-mono"
                autoFocus
              />
            </label>
            {skuCode && (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                ในรายการที่แสดงอยู่พบใน{" "}
                <span className="font-semibold">{skuHits.length} ใบ</span>
                {skuHits.length > 0 && ` (${skuHits.map((o) => o.label).slice(0, 4).join(", ")}${skuHits.length > 4 ? " …" : ""})`}
                {" "}— ระบบจะเคลียร์จากทุกออเดอร์รออนุมัติที่คุณดูแล ไม่ใช่เฉพาะที่กรองอยู่
                ส่วนลดโปรกลุ่มของสินค้าที่เหลือในใบคิดใหม่ให้
              </p>
            )}
            <NotifyStoreCheckbox checked={notify} onChange={setNotify} />
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          ยกเลิก
        </Button>
        <Button
          variant="destructive"
          onClick={() => void confirm()}
          disabled={!canConfirm || busy}
          pending={busy}
        >
          {mode === "orders" ? `เคลียร์ ${picked.size} ใบ` : `เคลียร์สินค้า ${skuCode || ""}`}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
