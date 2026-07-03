"use client";

import { useCallback, useEffect, useState } from "react";

export interface PersonCodeAssignment {
  code: string;
  vdas: string[];
}

export interface PersonVdaRow {
  email: string;
  name: string;
  codes: PersonCodeAssignment[];
  allVdas: string[];
  multipleCodes: boolean;
  hasVdaAccess: boolean;
  /** รหัสมีใน vda_aos แต่ไม่พบอีเมลใน cross_salesman */
  unmapped?: boolean;
}

export interface VdaSalesDirectory {
  loaded: { salesmanMaster: boolean; vdaAosBill: boolean };
  people: PersonVdaRow[];
  peopleWithVda?: PersonVdaRow[];
  vdas?: Array<{
    vda: string;
    salesmanCodes: string[];
    salesmen: Array<{ code: string; name: string; email: string }>;
    people: Array<{ email: string; name: string; codes: string[] }>;
  }>;
  vdasWithSalesman?: Array<{
    vda: string;
    salesmanCodes: string[];
    salesmen: Array<{ code: string; name: string; email: string }>;
    people: Array<{ email: string; name: string; codes: string[] }>;
  }>;
  stats: {
    totalPeople: number;
    peopleWithVda: number;
    withVdaAccess: number;
    totalSalesmen?: number;
    withoutVdaAccess?: number;
  };
}

export function useVdaSalesDirectory(enabled = true) {
  const [data, setData] = useState<VdaSalesDirectory | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/vda-sales");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export function getPeopleWithVda(data: VdaSalesDirectory | null): PersonVdaRow[] {
  if (!data) return [];
  if (Array.isArray(data.peopleWithVda)) return data.peopleWithVda;
  return data.people.filter((p) => p.hasVdaAccess);
}
