import { redirect } from "next/navigation";

/** URL เดิมก่อนแยกเป็นแท็บย่อย — คง redirect ไว้ให้ bookmark เก่าใช้ได้ */
export default function AdminDevPage() {
  redirect("/admin/sync");
}
