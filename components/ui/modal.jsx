"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Modal wrapper chuẩn hóa dựa trên shadcn Dialog.
 * Thay thế class .modal-backdrop / .modal-box cũ.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  maxWidth = "max-w-2xl",
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent {...(!description ? { 'aria-describedby': undefined } : {})} className={cn(maxWidth, "modal-shell max-h-[90dvh]", className)}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div className="modal-content-scroll">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export { DialogClose };
