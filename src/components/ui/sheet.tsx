"use client";

import { useEffect, useRef } from "react";

/**
 * Modal sheet built on the native <dialog> element: focus is trapped, Esc closes,
 * focus returns to the opener, and the page behind is inert. Right-hand panel on
 * desktop, bottom sheet on small screens.
 */
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
  side = "right",
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  side?: "right" | "center";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      opener.current?.focus?.();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      className={`sheet sheet-${side} ${className}`}
    >
      <div className="sheet-inner">{children}</div>
    </dialog>
  );
}
