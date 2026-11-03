"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BASE_PATH } from "@/lib/paths";
import { movedTargetUrl } from "@/lib/moved";

/**
 * ปุ่มไปเว็บใหม่ที่หน้าเดียวกับหน้าที่เปิดอยู่ — root layout ไม่รู้ path จึงอ่านจาก location ฝั่งเบราว์เซอร์
 * ก่อนโหลด JS เสร็จ ปุ่มชี้หน้าแรกเว็บใหม่ (ยังกดได้เสมอ)
 */
export function MovedLink({ url }: { url: string }) {
  const [href, setHref] = useState(url);

  useEffect(() => {
    setHref(movedTargetUrl(url, BASE_PATH, window.location.pathname, window.location.search));
  }, [url]);

  return (
    <>
      <a
        href={href}
        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white hover:bg-teal-700"
      >
        ไปที่ระบบใหม่
        <ArrowRight className="h-4 w-4" />
      </a>
      <p className="mt-3 break-all text-xs text-slate-500 dark:text-slate-400">{href}</p>
    </>
  );
}
