import { cn } from "@/lib/utils";
import { CustomerMobileNav } from "@/components/layout/customer-mobile-nav";

export function PageShell({
  children,
  className,
  customerNav = false,
}: {
  children: React.ReactNode;
  className?: string;
  customerNav?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-screen vmi-mesh-bg",
        customerNav && "pb-20 md:pb-0",
        className
      )}
    >
      {children}
      {customerNav && <CustomerMobileNav />}
    </div>
  );
}
