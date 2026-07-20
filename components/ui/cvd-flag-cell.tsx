import { FlagBadge } from "@/components/ui/badge";
import { formatDays, type CvdFlag } from "@/lib/calculations";
import { cn } from "@/lib/utils";

const flagTextColors: Record<CvdFlag, string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  yellow: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
};

export function CvdFlagCell({
  cvdEst,
  flag,
  align = "right",
}: {
  cvdEst: number | null;
  flag?: CvdFlag | null;
  align?: "left" | "center" | "right";
}) {
  if (!flag) {
    return (
      <span className="text-xs tabular-nums text-slate-500">
        {formatDays(cvdEst)}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap",
        align === "center" && "justify-center",
        align === "left" && "justify-start",
        align === "right" && "justify-end"
      )}
      title={formatDays(cvdEst) ?? undefined}
    >
      <span
        className={cn(
          "text-xs font-bold tabular-nums xl:text-sm",
          flagTextColors[flag]
        )}
      >
        {formatDays(cvdEst)}
      </span>
      <FlagBadge flag={flag} compact dotOnly className="xl:hidden" />
      <FlagBadge flag={flag} compact className="hidden shrink-0 xl:inline-flex" />
    </div>
  );
}
