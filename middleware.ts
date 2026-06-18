import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CUSTOMER_STORE_COOKIE, SALES_SESSION_COOKIE } from "@/lib/auth/roles";

const SALES_PREVIEW_COOKIE = "vmi_sales_preview";
const SALES_PREVIEW_INFO_COOKIE = "vmi_sales_preview_info";

const customerRoutes = ["/stock", "/order"];
const salesRoutes = ["/sales"];
const adminRoutes = ["/admin"];

function hasSalesSessionCookie(token: string | undefined) {
  return !!token && token.includes(".");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth") ||
    pathname === "/login" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.next();
  }

  const storeId = request.cookies.get(CUSTOMER_STORE_COOKIE)?.value;
  const salesToken = request.cookies.get(SALES_SESSION_COOKIE)?.value;

  const isCustomerRoute = customerRoutes.some((r) => pathname.startsWith(r));
  const isSalesRoute = salesRoutes.some((r) => pathname.startsWith(r));
  const isAdminRoute = adminRoutes.some((r) => pathname.startsWith(r));

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
