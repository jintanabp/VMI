"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SalesCodeOption } from "@/app/api/admin/sales-codes/route";

interface SalesCodeFilterProps {
  options: SalesCodeOption[];
  /** รหัสเซลล์ที่เลือก ("" = ทุกรหัส) */
  value: string;
  onChange: (code: string) => void;
}

function vdaLabel(vdas: string[]) {
  return vdas.map((v) => v.toUpperCase()).join(", ");
}

/**
 * กรองออเดอร์ตามรหัสเซลล์ (creator เท่านั้น) — เลือกรหัสแล้วเห็นออเดอร์ของทุกคลังที่รหัสนั้นดูแล
 * ค้นได้ทั้งรหัส คลัง และอีเมลที่ผูกไว้
 */
export function SalesCodeFilter({ options, value, onChange }: SalesCodeFilterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        o.vdas.some((v) => v.includes(q)) ||
        o.emails.some((e) => e.includes(q))
    );
  }, [options, query]);

  // ล้างจากข้างนอก (เช่น กดแจ้งเตือน) — ช่องค้นหาต้องว่างตาม ไม่ค้างชื่อรหัสเดิม
  // ยกเว้นตอนผู้ใช้พิมพ์เอง (พิมพ์แล้วล้างค่าที่เลือก) ไม่งั้นตัวอักษรที่เพิ่งพิมพ์หายทันที
  const typingRef = useRef(false);
  useEffect(() => {
    if (!value && !typingRef.current) setQuery("");
    typingRef.current = false;
  }, [value]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function pick(option: SalesCodeOption | null) {
    onChange(option?.code ?? "");
    setQuery(option ? `${option.code} · ${vdaLabel(option.vdas)}` : "");
    setOpen(false);
  }

  return (
    <div className="mb-3">
      <label htmlFor={inputId} className="text-xs text-slate-500 dark:text-slate-400">
        กรองตามรหัสเซลล์
      </label>
      <div ref={containerRef} className="relative mt-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="pl-9 pr-9"
          placeholder="ค้นหารหัส / VDA / อีเมล"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) {
              typingRef.current = true;
              onChange("");
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {(value || query) && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            onClick={() => pick(null)}
            aria-label="ล้างตัวกรอง"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label="รหัสเซลล์"
            className="vmi-dropdown vmi-scroll absolute z-20 mt-1 max-h-56 w-full overflow-y-auto py-1"
          >
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80",
                  !value && "bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/30 dark:text-teal-300"
                )}
                onClick={() => pick(null)}
              >
                ทุกรหัส
              </button>
            </li>
            {filtered.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                ไม่พบรหัสเซลล์
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.code} role="option" aria-selected={value === o.code}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80",
                    value === o.code && "bg-teal-50 dark:bg-teal-950/30"
                  )}
                  onClick={() => pick(o)}
                >
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span className="font-mono text-teal-700 dark:text-teal-400">{o.code}</span>
                    {" · "}
                    {vdaLabel(o.vdas)}
                  </span>
                  <span className="mt-0.5 break-all text-xs text-slate-500 dark:text-slate-400">
                    {o.emails.length > 0 ? o.emails.join(", ") : "ยังไม่ผูกอีเมล"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
