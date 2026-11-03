import { MovedLink } from "./moved-link";
import { appPath } from "@/lib/paths";

/** หน้าแจ้งระบบย้าย — แสดงแทนทุกหน้าเมื่อตั้ง `MOVED_TO_URL` (lib/moved.ts) */
export function MovedNotice({ url }: { url: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          ระบบย้ายไปที่ใหม่แล้ว
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          กดปุ่มด้านล่างเพื่อเข้าใช้งานที่ลิงก์ใหม่ และบันทึกลิงก์ใหม่ไว้ใช้ครั้งต่อไป
        </p>
        <MovedLink url={url} />
        {/* ผู้ดูแลระบบยังดูข้อมูลระบบเก่าได้ — ปลดหน้า login เท่านั้น สิทธิ์จริงตัดสินตอน login */}
        <a
          href={appPath("/api/legacy-access/")}
          className="mt-6 inline-block text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:text-slate-500 dark:hover:text-slate-300"
        >
          สำหรับผู้ดูแลระบบ: เข้าดูข้อมูลระบบเก่า
        </a>
      </div>
    </main>
  );
}
