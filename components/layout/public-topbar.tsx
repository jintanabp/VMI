"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function PublicTopbar() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-xl px-1 py-1 text-slate-800 transition-opacity hover:opacity-80 dark:text-slate-100"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl vmi-gradient-brand text-white shadow-md">
            <Package className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-tight">VMI</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
