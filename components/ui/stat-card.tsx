import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  tone?: "default" | "amber" | "red" | "teal";
  className?: string;
}

const toneStyles = {
  default: {
    icon: "bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300",
    value: "text-slate-900 dark:text-slate-50",
  },
  amber: {
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-400",
  },
  red: {
    icon: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
  },
  teal: {
    icon: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400",
    value: "text-teal-700 dark:text-teal-400",
  },
};

export function StatCard({
  icon,
  value,
  label,
  tone = "default",
  className,
}: StatCardProps) {
  const s = toneStyles[tone];
  return (
    <div className={cn("vmi-stat-card flex items-center gap-4", className)}>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl lg:h-12 lg:w-12",
          s.icon
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className={cn("font-bold tabular-nums", s.value, "text-xl lg:text-2xl")}>
          {value}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 lg:text-sm">
          {label}
        </p>
      </div>
    </div>
  );
}
