/**
 * fetch ที่แยก "หมดสิทธิ์ (401)" ออกจาก error อื่น
 *
 * middleware เด้ง login เฉพาะตอนเปลี่ยนหน้า — fetch ในหน้าที่ session หมดกลางทางได้แค่
 * 401 เปล่า ๆ แล้ว query ทั่วแอปทำ `r.ok ? json : null` เงียบ ๆ ผลคือร้านที่มีของเต็ม
 * ตะกร้าเห็น "โหลดไม่สำเร็จ" + ปุ่มลองใหม่ที่ไม่มีวันสำเร็จ ไม่มีที่ไหนบอกให้ล็อกอินใหม่
 *
 * apiFetch โยน UnauthorizedError บน 401 เพื่อให้ตัวจัดการกลางที่ QueryClient
 * (ดู components/providers.tsx) เด้งไป /login ได้ · error อื่น (500 ฯลฯ) ปล่อยผ่าน
 * เป็น response ตามเดิม ผู้เรียกจัดการเองเหมือนที่เคย — จึงไม่กระทบ query ที่ยังไม่เปลี่ยน
 */
export class UnauthorizedError extends Error {
  constructor() {
    super("session หมดอายุ");
    this.name = "UnauthorizedError";
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) throw new UnauthorizedError();
  return res;
}
