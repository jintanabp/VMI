import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Keep cookie names here — do not import from roles.ts (pulls Prisma into Edge). */
const CUSTOMER_STORE_COOKIE = "vmi_store_id";
const SALES_SESSION_COOKIE = "vmi_sales_session";
const SALES_PREVIEW_COOKIE = "vmi_sales_preview";
const SALES_PREVIEW_INFO_COOKIE = "vmi_sales_preview_info";

const customerRoutes = ["/stock", "/order", "/manage"];
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

  const storeId = request.cookies.get(CUSTOMER_STORE_COOKIE)?.value;
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

  if (isCustomerRoute && !storeId) {
    return NextResponse.redirect(new URL("/login?mode=customer", request.url));
  }

  if ((isSalesRoute || isAdminRoute) && !hasSalesSessionCookie(salesToken)) {
    return NextResponse.redirect(new URL("/login?mode=sales", request.url));
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
    "/sales/:path*",
    "/admin/:path*",
  ],
};
