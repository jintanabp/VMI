"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/stock", label: "สต็อก", icon: Package },
  { href: "/order", label: "สั่งสินค้า", icon: ClipboardList },
] as const;

export function CustomerMobileNav() {
  const pathname = usePathname();

  if (!pathname.startsWith("/stock") && !pathname.startsWith("/order")) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden dark:border-slate-700/80 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-lg gap-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400"
                  : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
