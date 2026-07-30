"use client";

import { useRouter } from "next/navigation";
import { CustomerLoginForm } from "@/components/auth/customer-login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export function VdaPreviewPanel() {
  const router = useRouter();
  return (
    <Card className="vmi-card-elevated">
      <CardHeader className="pb-3">
        <CardDescription>
          เลือกคลัง VDA เพื่อดูสต็อกและสั่งสินค้าเหมือนผู้ใช้งานจริง
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CustomerLoginForm
          adminPreview
          onSuccess={() => router.push("/stock")}
        />
      </CardContent>
    </Card>
  );
}
