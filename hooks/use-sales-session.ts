"use client";

import { useEffect, useState } from "react";
import type { SalesSession } from "@/lib/auth/sales-session";

export function useSalesSession() {
  const [session, setSession] = useState<SalesSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/msal/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSession(data?.user ?? null))
      .finally(() => setLoading(false));
  }, []);

  return { session, loading };
}
