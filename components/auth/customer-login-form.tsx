"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatVdaLabel(code: string) {
  return code.toUpperCase();
}

export function CustomerLoginForm({
  adminPreview,
  onSuccess,
}: {
  adminPreview?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [vdaOptions, setVdaOptions] = useState<string[]>([]);
  const [loadingVda, setLoadingVda] = useState(true);
  const [vda, setVda] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/vda")
      .then((r) => r.json())
      .then((data: { sources?: string[] }) => {
        const sources = Array.isArray(data.sources) ? data.sources : [];
        setVdaOptions(sources);
      })
      .catch(() => setVdaOptions([]))
      .finally(() => setLoadingVda(false));
  }, []);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!vda) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vda }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      setLoading(false);
      return;
    }

    if (onSuccess) onSuccess();
    else {
      router.push("/stock");
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {adminPreview && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          โหมดทดสอบ Admin — เลือก VDA เพื่อดูสต็อกและสั่งสินค้า
        </div>
      )}

      <div>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          เลือกคลัง VDA ที่ต้องการดูสต็อกและสั่งสินค้า
        </p>

        {loadingVda ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            กำลังโหลดรายการ VDA...
          </div>
        ) : vdaOptions.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
            ยังไม่มีข้อมูล VDA — ตรวจสอบการ sync stock_cover_day จาก Fabric
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {vdaOptions.map((code) => {
              const selected = vda === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setVda(code)}
                  className={cn(
                    "vmi-vda-card group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-5 transition-all",
                    selected
                      ? "border-teal-500 bg-teal-50 shadow-md ring-2 ring-teal-500/30 dark:bg-teal-950/50"
                      : "border-slate-200 bg-white hover:border-teal-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-700"
                  )}
                >
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <Warehouse
                    className={cn(
                      "h-8 w-8 transition-colors",
                      selected
                        ? "text-teal-600 dark:text-teal-400"
                        : "text-slate-400 group-hover:text-teal-500"
                    )}
                  />
                  <span
                    className={cn(
                      "text-lg font-bold tracking-wide",
                      selected
                        ? "text-teal-800 dark:text-teal-200"
                        : "text-slate-800 dark:text-slate-200"
                    )}
                  >
                    {formatVdaLabel(code)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={loading || !vda || vdaOptions.length === 0}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังเข้าสู่ระบบ...
          </>
        ) : vda ? (
          `เข้าสู่ระบบ ${formatVdaLabel(vda)}`
        ) : (
          "เลือก VDA ก่อนเข้าสู่ระบบ"
        )}
      </Button>
    </form>
  );
}
