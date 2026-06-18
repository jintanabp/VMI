import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRawSalesSession } from "@/lib/auth/sales-session";

const bodySchema = z.object({
  code: z.string().trim().min(1),
});

export async function GET() {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const list = await prisma.allowedSalesCode.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "กรุณาระบุรหัส" }, { status: 400 });
  }

  const code = parsed.data.code.toUpperCase();
  const row = await prisma.allowedSalesCode.upsert({
    where: { code },
    create: { code },
    update: {},
  });
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(request: Request) {
  const session = await getRawSalesSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "กรุณาระบุรหัส" }, { status: 400 });
  }

  await prisma.allowedSalesCode.delete({ where: { code } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

