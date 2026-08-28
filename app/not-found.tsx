import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { getRawSalesSession } from "@/lib/auth/sales-session";

/**
 * ปุ่มกลับต้องพากลับ "บ้านของบทบาทที่ล็อกอินอยู่"
 *
 * เดิม hardcode ไว้ที่ `/` ซึ่ง `/` เด้งเข้าหน้าร้านเสมอ — แอดมินกับเซลล์ที่พิมพ์
 * ที่อยู่ผิดจึงถูกส่งไปหน้าสต็อกของร้าน VDA1 พร้อมปุ่มสั่งของครบชุด แทนที่จะ
 * กลับหน้างานตัวเอง
 *
 * อ่านเฉพาะ session ดิบ ไม่ผ่าน preview — หน้านี้แค่เลือกปลายทาง ไม่ได้ให้สิทธิ์อะไร
 */
export default async function NotFound() {
  const session = await getRawSalesSession();
  const home =
    session?.role === "admin"
      ? { href: "/admin", label: "กลับหน้าผู้ดูแลระบบ" }
      : session
        ? { href: "/sales", label: "กลับหน้าพนักงานขาย" }
        : { href: "/", label: "กลับหน้าแรก" };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center vmi-mesh-bg">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <FileQuestion className="h-8 w-8" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600 dark:text-teal-400">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
        ไม่พบหน้านี้
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        หน้าที่คุณเปิดอาจถูกย้าย ลบไปแล้ว หรือพิมพ์ที่อยู่ผิด
      </p>

      <Link
        href={home.href}
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
      >
        <Home className="h-4 w-4" />
        {home.label}
      </Link>
    </div>
  );
}
