import { NextResponse } from "next/server";
import { getSalesSession } from "@/lib/auth/sales-session";
import { getSalesVdaAccessForSession } from "@/lib/admin/vda-sales-directory";
import {
  resolveAllPersonVdaCodes,
  resolveSalesmanCodesForFilter,
} from "@/lib/orders/access";

export async function GET() {
  const session = await getSalesSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role === "admin") {
    return NextResponse.json({
      email: session.email,
      salesmanCode: session.salesmanCode,
      salesmanName: session.salesmanName,
      vdas: [],
      hasVdaAccess: true,
      isAdmin: true,
      vdaRegistryLoaded: true,
      salesmanMasterLoaded: true,
    });
  }

  const access = getSalesVdaAccessForSession({
    email: session.email,
    salesmanCode: session.salesmanCode,
    scopeSalesmanCodes: resolveSalesmanCodesForFilter(session),
    role: session.role,
  });

  const allPersonVdas = resolveAllPersonVdaCodes(session.email);

  return NextResponse.json({
    ...access,
    allPersonVdas,
    hasAnyPersonVda: allPersonVdas.length > 0,
    isAdmin: false,
  });
}
