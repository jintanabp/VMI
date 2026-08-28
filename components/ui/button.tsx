import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#0f4c75] text-white shadow-md hover:bg-[#0d3d5c] dark:bg-[#1a6b9a] dark:hover:bg-[#155a82]",
        secondary:
          "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
        outline:
          "border border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-teal-600 dark:hover:bg-teal-950/30",
        destructive:
          "bg-red-600 text-white shadow-md hover:bg-red-700",
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        success:
          "bg-emerald-600 text-white shadow-md hover:bg-emerald-700",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-3.5 text-xs",
        lg: "h-13 rounded-xl px-7 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** กำลังทำงานอยู่ — disable ตัวเองและขึ้นสปินเนอร์นำหน้า */
  pending?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, pending, children, ...props },
    ref
  ) => {
    // asChild ต้องส่ง children ต่อไปดิบ ๆ — Slot รับลูกได้ตัวเดียว
    // และ child อาจเป็น <a> ซึ่งไม่มี type/disabled
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    const isDisabled = props.disabled || pending;

    const button = (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        // ต้องอยู่หลัง spread ไม่งั้นค่าจาก props จะทับ
        // default type="button" — กัน <Button onClick> ใน <form> ยิง submit โดยไม่ตั้งใจ
        type={props.type ?? "button"}
        disabled={isDisabled}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {children}
      </button>
    );

    /**
     * ปุ่มที่ disabled ไม่รับ hover event (`disabled:pointer-events-none`) เบราว์เซอร์
     * จึงไม่แสดง tooltip ของ `title` เลย — คำอธิบายว่า "ทำไมกดไม่ได้" ที่เขียนไว้ทั้งระบบ
     * (เช่น "ข้อมูลจริงยังไม่ถึง 90 วัน", "มีรายการจำนวน 0 ปรับก่อนตรวจสอบ")
     * ไม่เคยถึงผู้ใช้สักครั้ง
     *
     * ครอบด้วย <span> ที่รับ hover แทน — ผู้ใช้จ่อปุ่มเทาแล้วเห็นเหตุผลได้จริง
     */
    if (isDisabled && props.title) {
      return (
        <span title={props.title} className="inline-flex">
          {button}
        </span>
      );
    }

    return button;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
