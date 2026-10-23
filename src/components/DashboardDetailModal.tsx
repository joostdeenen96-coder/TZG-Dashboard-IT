import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DashboardDetailModalProps = {
  title: string;
  subtitle?: ReactNode;
  kicker?: string;
  footer?: ReactNode;
  testId: string;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  children: ReactNode;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function DashboardDetailModal({
  title,
  subtitle,
  kicker,
  footer,
  testId,
  onClose,
  returnFocus,
  children,
}: DashboardDetailModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const openedAtRef = useRef(Date.now());
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  onCloseRef.current = onClose;
  returnFocusRef.current = returnFocus;

  useEffect(() => {
    openedAtRef.current = Date.now();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      const restore = returnFocusRef.current;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, []);

  const requestClose = () => {
    if (Date.now() - openedAtRef.current < 350) return;
    onClose();
  };

  return createPortal(
    <div className="dashboard-detail-overlay" data-testid={testId} role="presentation" onClick={requestClose}>
      <section
        ref={dialogRef}
        className="tv-card dashboard-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dashboard-detail-header">
          <div className="min-w-0">
            {kicker ? <p className="dashboard-detail-kicker">{kicker}</p> : null}
            <h2 id={titleId} className="dashboard-detail-title">
              {title}
            </h2>
            {subtitle ? <div className="dashboard-detail-subtitle">{subtitle}</div> : null}
          </div>
          <button type="button" className="dashboard-detail-close" aria-label="Sluiten" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </header>
        <div className="dashboard-detail-scroll" data-detail-scroll="">
          {children}
        </div>
        {footer ? <footer className="dashboard-detail-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
