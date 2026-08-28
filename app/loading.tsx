/**
 * ตอบสนองทันทีที่กดเปลี่ยนหน้า
 *
 * App Router รอ payload จากเซิร์ฟเวอร์ให้เสร็จก่อนจึงเปลี่ยน URL — ถ้าไม่มี
 * loading boundary ผู้ใช้จะกดแล้ว "ไม่มีอะไรเกิดขึ้น" จนกว่าจะโหลดเสร็จ
 * แล้วกดซ้ำเพราะคิดว่าไม่ติด บนเน็ตช้า (มือถือในคลัง) ช่วงนั้นกินเวลาหลายวินาที
 *
 * ไฟล์เดียวที่ราก ครอบทุกหน้าที่ไม่มี loading ของตัวเอง
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 vmi-mesh-bg">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
        role="status"
        aria-label="กำลังโหลด"
      />
      <p className="text-sm text-slate-500 dark:text-slate-400">กำลังโหลด…</p>
    </div>
  );
}
