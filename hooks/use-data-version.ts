"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appPath } from "@/lib/paths";
import { apiFetch } from "@/lib/api-fetch";

export interface DataVersionInfo {
  version: string;
  dataDate: string;
  lastSuccessAt: string | null;
  refreshing: boolean;
}

const POLL_MS = 5 * 60_000;

/**
 * ทำให้แท็บที่เปิดค้างรู้เองว่ามีข้อมูลใหม่ — เดิมสิ่งเดียวที่ล้าง cache ได้
 * คือปุ่มรีเฟรชของร้านเอง แอดมินกดดึงข้อมูลใหม่แล้วหน้าร้านไม่รู้เรื่องเลย
 *
 * ตัว endpoint ราคาถูก (statSync 6 ครั้ง) จึงเปิด refetchOnWindowFocus ได้
 * ต่างจาก query ["stock"] ที่หนักและยังปิดไว้ตามเดิม
 */
export function useDataVersion(
  invalidateKeys: ReadonlyArray<readonly string[]>
) {
  const queryClient = useQueryClient();
  const seen = useRef<string | null>(null);

  const { data } = useQuery<DataVersionInfo>({
    queryKey: ["data-version"],
    queryFn: async () => {
      const res = await apiFetch(appPath("/api/data-version"), {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`data-version ${res.status}`);
      return (await res.json()) as DataVersionInfo;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const version = data?.version;

  useEffect(() => {
    if (!version) return;
    // ครั้งแรกแค่จดค่าไว้ — ไม่ invalidate เพราะข้อมูลที่เพิ่งโหลดมาก็ตรงอยู่แล้ว
    if (seen.current && seen.current !== version) {
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    }
    seen.current = version;
    // invalidateKeys เป็น literal คงที่จากผู้เรียก จึงไม่ต้องใส่ใน deps
    // (ถ้าใส่จะ re-run ทุก render เพราะ array literal สร้างใหม่ทุกครั้ง)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, queryClient]);

  return data;
}
