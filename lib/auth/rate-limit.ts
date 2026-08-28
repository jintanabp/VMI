/**
 * ตัวนับ sliding window ในหน่วยความจำ — กันเดารหัสผ่าน/ยิงคำขอรัวๆ
 *
 * เก็บใน Map ของ process เดียว: รีสตาร์ทแล้วรีเซ็ต และถ้าวันหนึ่งขยายเป็นหลาย
 * container ต่างตัวต่างนับ — พอสำหรับ v1 ที่รันคอนเทนเนอร์เดียวหลัง nginx
 * ถ้าต้องการของจริงข้ามอินสแตนซ์ค่อยย้ายไป Redis ทีหลัง (สัญญาเดิมใช้ต่อได้)
 *
 * ฟังก์ชันบริสุทธิ์: รับ `now` เข้ามาได้เพื่อให้เทสต์คุมเวลาเองโดยไม่ต้อง mock timer
 */

export interface RateLimitRule {
  /** จำนวนครั้งสูงสุดในหนึ่งหน้าต่าง */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** จำนวนครั้งที่เหลือในหน้าต่างนี้ (0 เมื่อเต็ม) */
  remaining: number;
  /** วินาทีที่ต้องรอก่อนลองใหม่ — 0 เมื่อยังไม่เต็ม */
  retryAfterSec: number;
}

/** เวลาที่ยิงเข้ามาของแต่ละ key (ms) เรียงเก่า→ใหม่ */
const hits = new Map<string, number[]>();

/** กันไม่ให้ Map โตไม่จำกัดเมื่อมี IP แปลกหน้าเข้ามาเรื่อยๆ */
const MAX_KEYS = 10_000;

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now()
): RateLimitResult {
  const windowStart = now - rule.windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= rule.limit) {
    hits.set(key, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
    };
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_KEYS) pruneRateLimit(now);

  return {
    allowed: true,
    remaining: rule.limit - recent.length,
    retryAfterSec: 0,
  };
}

/** ล้าง key ที่ไม่มีการยิงในชั่วโมงที่ผ่านมา */
export function pruneRateLimit(now: number = Date.now(), maxAgeMs = 60 * 60 * 1000) {
  const cutoff = now - maxAgeMs;
  for (const [key, times] of hits) {
    const kept = times.filter((t) => t > cutoff);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
  }
}

/** ใช้ในเทสต์เท่านั้น */
export function resetRateLimit() {
  hits.clear();
}

/**
 * IP ของผู้เรียกจริง — nginx อยู่หน้าแอป ตัว request.ip จึงเป็น IP ของ proxy เสมอ
 * เอา hop แรกของ x-forwarded-for (ที่ nginx เติมให้) ไม่ใช่ตัวสุดท้าย
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** 429 พร้อมข้อความไทยและ Retry-After — ใช้รูปแบบเดียวกันทุก route */
export function tooManyRequests(result: RateLimitResult) {
  const mins = Math.ceil(result.retryAfterSec / 60);
  const wait = mins > 1 ? `${mins} นาที` : `${result.retryAfterSec} วินาที`;
  return Response.json(
    { error: `พยายามบ่อยเกินไป กรุณารออีก ${wait}` },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
  );
}
