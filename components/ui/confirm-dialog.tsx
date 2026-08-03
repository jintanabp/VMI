"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * กล่องยืนยันแทน window.confirm()
 * `confirm()` บล็อก main thread และบน webview ดูเหมือนแอปค้าง
 * โครง (portal / Esc / คุมความสูง) อยู่ใน components/ui/modal.tsx แล้ว
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "danger",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setPending(false);
  }, [open]);

  async function run() {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      size="sm"
      labelledBy="confirm-dialog-title"
    >
      <ModalBody className="pt-4 sm:pt-5">
        <h3
          id="confirm-dialog-title"
          className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100"
        >
          {tone === "danger" && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          {title}
        </h3>
        {body && (
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {body}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button size="sm" variant="outline" disabled={pending} onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          size="sm"
          variant={tone === "danger" ? "destructive" : "default"}
          pending={pending}
          onClick={() => void run()}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
