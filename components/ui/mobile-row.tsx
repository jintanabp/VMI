import { cn } from "@/lib/utils";

export function MobileRowList({
  className,
  grid,
  children,
}: {
  className?: string;
  grid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-slate-100 dark:divide-slate-700/60",
        grid && "vmi-card-grid md:divide-y-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MobileRow({
  className,
  selected,
  warn,
  children,
}: {
  className?: string;
  selected?: boolean;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-2 py-2.5 transition-colors sm:px-3",
        warn && "bg-amber-50/60 dark:bg-amber-950/30",
        selected && "bg-teal-50/50 dark:bg-teal-950/35",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MobileRowTop({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-2", className)}>{children}</div>
  );
}

export function MobileRowStats({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MobileStat({
  label,
  value,
  highlight,
  warn,
  title,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  highlight?: boolean;
  warn?: boolean;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={title}>
      <span className="shrink-0 text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children ?? (
        <span
          className={cn(
            "font-semibold tabular-nums",
            highlight && "text-teal-700 dark:text-teal-400",
            warn && "text-amber-700 dark:text-amber-400",
            !highlight && !warn && "text-slate-900 dark:text-slate-100"
          )}
        >
          {value}
        </span>
      )}
    </span>
  );
}

export function MobileRowExtra({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mt-1.5 min-w-0", className)}>{children}</div>;
}
