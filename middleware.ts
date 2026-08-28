import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { appPath } from "@/lib/paths";

/** Keep cookie names here — do not import from roles.ts (pulls Prisma into Edge). */
const CUSTOMER_STORE_COOKIE = "vmi_store_id";
const STORE_SESSION_COOKIE = "vmi_store_session";
const SALES_SESSION_COOKIE = "vmi_sales_session";
const SALES_PREVIEW_COOKIE = "vmi_sales_preview";
const SALES_PREVIEW_INFO_COOKIE = "vmi_sales_preview_info";

const customerRoutes = ["/stock", "/order", "/manage", "/history"];
const salesRoutes = ["/sales"];
const adminRoutes = ["/admin"];

function hasSalesSessionCookie(token: string | undefined) {
  return !!token && token.includes(".");
}

/**
 * Next.js bug: basePath + middleware on the index route (`/`) can return an empty
 * 200 body. Only run middleware on protected routes — never on `/`.
 * @see https://github.com/vercel/next.js/issues/64910
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /**
   * ผ่านด่านนี้ถ้ามี cookie ตัวใดตัวหนึ่ง — ตัวตนจริงตัดสินที่ฝั่งเซิร์ฟเวอร์
   * ด้วย `getAuthorizedStore()` อีกชั้น (Edge ตรวจลายเซ็นเองไม่ได้)
   *
   * ต้องดู `vmi_store_session` ด้วย ไม่ใช่แค่ `vmi_store_id`: ถ้า cookie สองตัวนี้
   * หลุดไม่พร้อมกัน (หมดอายุคนละเวลา ผู้ใช้ล้างบางตัว ส่วนขยายบล็อก) จะเกิดวงวน —
   * middleware เห็นว่าไม่มี id เลยส่งไป /login แต่หน้า /login เห็น session ที่ยังใช้ได้
   * เลยส่งกลับมา /stock วนไปมาจนเบราว์เซอร์ตัดด้วย ERR_TOO_MANY_REDIRECTS
   * และผู้ใช้เข้าระบบไม่ได้เลยจนกว่าจะล้าง cookie เอง
   */
  const storeId =
    request.cookies.get(CUSTOMER_STORE_COOKIE)?.value ||
    request.cookies.get(STORE_SESSION_COOKIE)?.value;
  const salesToken = request.cookies.get(SALES_SESSION_COOKIE)?.value;

  const isCustomerRoute = customerRoutes.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );
  const isSalesRoute = salesRoutes.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );
  const isAdminRoute = adminRoutes.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );

  // appPath() ต้องมี — `new URL(path, request.url)` แทนที่ path ทั้งเส้น
  // basePath /vmi เลยหลุด แล้ว Location ที่ส่งกลับไปกลายเป็น 404
  if (isCustomerRoute && !storeId) {
    return NextResponse.redirect(
      new URL(appPath("/login?mode=customer"), request.url)
    );
  }

  if ((isSalesRoute || isAdminRoute) && !hasSalesSessionCookie(salesToken)) {
    return NextResponse.redirect(
      new URL(appPath("/login?mode=sales"), request.url)
    );
  }

  if (isAdminRoute) {
    const response = NextResponse.next();
    response.cookies.delete(SALES_PREVIEW_COOKIE);
    response.cookies.delete(SALES_PREVIEW_INFO_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/stock/:path*",
    "/order/:path*",
    "/manage/:path*",
    "/history/:path*",
    "/sales/:path*",
    "/admin/:path*",
  ],
};
