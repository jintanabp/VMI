/**
 * วันที่แบบไทยสั้น ๆ — `28 ส.ค. 69` หรือ `28 ส.ค. 69 13:59 น.` เมื่อมีเวลาติดมาด้วย
 *
 * รับได้ทั้งค่าจาก `<input type="date">` ("YYYY-MM-DD"), `type="datetime-local"`
 * ("YYYY-MM-DDTHH:mm") และ ISO เต็มจากเซิร์ฟเวอร์ · คืน "" เมื่อค่าว่างหรืออ่านไม่ออก
 */
export function formatThaiDateTime(value: string): string {
  if (!value) return "";
  // `date` ส่งมาแค่วัน — ต่อเวลาให้ก่อน ไม่งั้น new Date() อ่านเป็น UTC แล้วเพี้ยนไปหนึ่งวัน
  const hasTime = value.includes("T");
  const d = new Date(hasTime ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
  if (!hasTime) return day;
  const time = d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${time} น.`;
}

/**
 * ทวนวันที่ที่เลือกเป็นภาษาไทย ข้าง ๆ ช่องกรอก
 *
 * `<input type="date">` และ `type="datetime-local"` แสดงรูปแบบตาม locale ของเบราว์เซอร์
 * เครื่องที่ตั้งเป็น en-US จะได้ `09/02/2026` ซึ่งบน UI ภาษาไทยอ่านได้ทั้ง "2 ก.ย." และ
 * "9 ก.พ." — คนละเดือนกัน · เปลี่ยนรูปแบบในตัว input เองไม่ได้ (ต้องเขียน date picker
 * ใหม่ทั้งตัว) แต่ทวนค่าที่ระบบเข้าใจให้เห็นได้ ซึ่งแก้ความกำกวมจบ
 *
 * ใช้ตัวเดียวกันทั้งตัวกรอง PO และช่วงวันหยุดสั่ง เพื่อให้การ์ดใบเดียวกันไม่โชว์ปฏิทิน
 * คนละแบบระหว่างโหมดอ่าน (`28 ส.ค. 69`) กับโหมดแก้
 */
export function ThaiDateEcho({ iso }: { iso: string }) {
  const text = formatThaiDateTime(iso);
  if (!text) return null;
  return (
    <span className="whitespace-nowrap vmi-t-xs text-slate-500 dark:text-slate-400">
      {text}
    </span>
  );
}
