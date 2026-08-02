import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { OVERLAY_Z_CLASS } from "../../lib/overlayZIndex";

type SettingsModalShellProps = {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  description?: string;
  /** Uppercase label above title; omit or null to hide. Default: Settings */
  eyebrow?: string | null;
  icon?: LucideIcon;
  children: ReactNode;
  footer?: ReactNode;
  /** z-index tier; default matches legacy settings modals in `OVERLAY_Z_CLASS`. */
  zIndexClass?: string;
  maxWidthClass?: string;
  /** When true, backdrop and close button do not dismiss (e.g. while a job runs). */
  disableDismiss?: boolean;
};

export function SettingsModalShell({
  open,
  onClose,
  titleId,
  title,
  description,
  eyebrow = "Settings",
  icon: Icon,
  children,
  footer,
  zIndexClass = OVERLAY_Z_CLASS.settings,
  maxWidthClass = "max-w-lg",
  disableDismiss = false,
}: SettingsModalShellProps) {
  if (!open) return null;

  const tryClose = () => {
    if (!disableDismiss) onClose();
  };

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/65 p-4`}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={tryClose}
        disabled={disableDismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[min(85vh,720px)] w-full ${maxWidthClass} flex-col overflow-hidden rounded-[var(--radius-modal)] bg-[#1D1613] shadow-[0_16px_48px_rgba(0,0,0,0.45)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 space-y-2 px-6 pb-1 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              {Icon ? (
                <Icon
                  size={16}
                  className="text-[color:var(--accent)]"
                  aria-hidden
                />
              ) : null}
              {eyebrow ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  {eyebrow}
                </p>
              ) : null}
              <h2
                id={titleId}
                className="text-base font-semibold leading-snug text-stone-100"
              >
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={tryClose}
              disabled={disableDismiss}
              className="shrink-0 rounded-lg p-1.5 text-stone-500 transition-colors hover:text-stone-200 disabled:invisible"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          {description ? (
            <p className="max-w-prose text-[12px] leading-relaxed text-stone-500">
              {description}
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 rf-scrollbar">
          {children}
        </div>

        {footer ? (
          <footer className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-6 pb-6 pt-2">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsModalSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-input)] bg-[#261d18] px-4 py-3 ${className}`}
    >
      {children}
    </div>
  );
}

export function SettingsModalEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
      {children}
    </p>
  );
}

const btnBase =
  "inline-flex items-center justify-center px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-[color,transform,opacity] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export function SettingsModalBtnSecondary({
  children,
  onClick,
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${btnBase} text-stone-500 hover:font-extrabold hover:text-stone-200 ${className}`}
    >
      {children}
    </button>
  );
}

export function SettingsModalBtnGhost({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${btnBase} bg-[#1D1613] text-[color:var(--accent)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] hover:bg-stone-800 ${className}`}
    >
      {children}
    </button>
  );
}

export function SettingsModalBtnPrimary({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${btnBase} rounded-[var(--radius-input)] bg-[color:var(--accent)] text-[#1D1613] hover:brightness-105 ${className}`}
    >
      {children}
    </button>
  );
}

export function SettingsModalTextInput({
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-[var(--radius-input)] bg-[#261d18] px-4 py-3 text-[13px] text-stone-200 outline-none placeholder:text-stone-600 focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent),transparent_55%)] disabled:opacity-50"
    />
  );
}
