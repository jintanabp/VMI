import { ArrowRight } from "lucide-react";

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
        <a
          href={url}
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          ไปที่ระบบใหม่
          <ArrowRight className="h-4 w-4" />
        </a>
        <p className="mt-3 break-all text-xs text-slate-500 dark:text-slate-400">{url}</p>
      </div>
    </main>
  );
}
