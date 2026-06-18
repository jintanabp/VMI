"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SalesRepOption {
  id: string;
  code: string;
  name: string;
  email: string;
}

interface SalesRepFilterProps {
  reps: SalesRepOption[];
  value: string;
  onChange: (repId: string) => void;
}

export function SalesRepFilter({ reps, value, onChange }: SalesRepFilterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...reps].sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
      ),
    [reps]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted.slice(0, 80);
    return sorted
      .filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [sorted, query]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function pick(rep: SalesRepOption | null) {
    if (!rep) {
      onChange("");
      setQuery("");
    } else {
      onChange(rep.id);
      setQuery(`${rep.code} — ${rep.name}`);
    }
    setOpen(false);
  }

  return (
    <div className="mb-3">
      <label className="text-xs text-slate-500 dark:text-slate-400">
        กรองตามเซลล์
      </label>
      <div ref={containerRef} className="relative mt-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9 pr-9"
          placeholder="ค้นหารหัส / ชื่อ / อีเมล..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange("");
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
          <ul className="vmi-dropdown vmi-scroll absolute z-20 mt-1 max-h-56 w-full overflow-y-auto py-1">
            <li>
              <button
                type="button"
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80",
                  !value && "bg-teal-50 font-medium text-teal-800 dark:bg-teal-950/30 dark:text-teal-300"
                )}
                onClick={() => pick(null)}
              >
                ทุกเซลล์
              </button>
            </li>
            {filtered.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400">
                ไม่พบเซลล์
              </li>
            )}
            {filtered.map((rep) => (
              <li key={rep.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/80",
                    value === rep.id && "bg-teal-50 dark:bg-teal-950/30"
                  )}
                  onClick={() => pick(rep)}
                >
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span className="font-mono text-teal-700 dark:text-teal-400">
                      {rep.code}
                    </span>
                    {" · "}
                    {rep.name}
                  </span>
                  <span className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {rep.email}
                  </span>
                </button>
              </li>
            ))}
            {!query && sorted.length > 80 && (
              <li className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                พิมพ์เพื่อค้นหาใน {sorted.length} เซลล์
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
