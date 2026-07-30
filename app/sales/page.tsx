import { redirect } from "next/navigation";

/**
 * `/sales` ไม่มีหน้าเป็นของตัวเอง — ทุกลิงก์ในแอปชี้ `/sales/orders` อยู่แล้ว
 * แต่ถ้ามีคนพิมพ์ `/sales/` ตรง ๆ จะ 404 จึงส่งต่อให้
 * (guard อยู่ที่ app/sales/layout.tsx ผู้ที่ยังไม่ล็อกอินจะถูกส่งไป /login ก่อนถึงตรงนี้)
 */
export default function SalesIndexPage() {
  redirect("/sales/orders");
}
