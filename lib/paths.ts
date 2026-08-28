/** Must match next.config.ts `basePath`. */
export const BASE_PATH = "/vmi" as const;

/**
 * Prefix an app-absolute path with basePath.
 * - appPath("/api/health") → "/vmi/api/health"
 * - appPath("/") → "/vmi/"
 * - leaves http(s) and already-prefixed paths unchanged
 */
export function appPath(path: string): string {
  if (!path) return BASE_PATH;
  if (/^https?:\/\//i.test(path)) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized === "/") return `${BASE_PATH}/`;
  return `${BASE_PATH}${normalized}`;
}

/**
 * ตรงข้ามกับ `appPath` — แปลงค่าที่ได้จาก `usePathname()` ให้เทียบกับ href ในโค้ดได้
 *
 * `usePathname()` **ตัด basePath ออกให้แล้ว** (Next ทำที่ app-router: `hasBasePath`
 * → `removeBasePath`) แต่ **ไม่ตัด `/` ปิดท้าย** ที่มาจาก `trailingSlash: true`
 * ค่าจริงจึงเป็น `/sales/orders/` การเทียบ `pathname === "/sales/orders"` ตรง ๆ
 * จึงไม่มีวันตรง — แท็บไม่ไฮไลต์โดยไม่มีอะไรพังให้เห็น จึงสังเกตยากมาก
 *
 * รับ path ที่ยังมี basePath ติดมาด้วยได้ เผื่อผู้เรียกที่ไม่ได้มาจาก usePathname()
 *
 * normalizePathname("/sales/orders/") → "/sales/orders"
 * normalizePathname("/vmi/sales/orders/") → "/sales/orders"
 * normalizePathname("/vmi/") → "/"
 */
export function normalizePathname(pathname: string | null | undefined): string {
  if (!pathname) return "";
  let p = pathname.split("?")[0].split("#")[0];
  if (p === BASE_PATH) return "/";
  if (p.startsWith(`${BASE_PATH}/`)) p = p.slice(BASE_PATH.length);
  while (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/** ตรงกันพอดี หรือเป็นหน้าลูกของ base — ไม่ใช่แค่ขึ้นต้นเหมือนกัน */
export function isPathUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}
