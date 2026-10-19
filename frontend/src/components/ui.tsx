import clsx from "clsx";
import { AlertCircle, CheckCircle2, Loader2, RotateCw, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import type { LessonStatus } from "../api/types";
import { useI18n } from "../i18n";
import { statusMeta, type Tone } from "../lib/format";

/* ------------------------------------------------------------------ page title */

export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · OpenLesson`;
  }, [title]);
}

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        (variant === "primary" || variant === "brand") && "bg-brand-900 text-white shadow-card hover:bg-brand-800",
        variant === "secondary" && "border border-gray-200 bg-white text-gray-900 shadow-card hover:border-gray-300 hover:bg-gray-50",
        variant === "ghost" && "text-gray-700 hover:bg-gray-900/5",
        variant === "danger" && "bg-red-600 text-white shadow-card hover:bg-red-700",
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ surfaces */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx("rounded-2xl border border-gray-200/80 bg-white shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-gray-400 [&>svg]:size-5">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-gray-950 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 text-[15px] font-semibold tracking-[-0.01em] text-gray-900">
      {children}
      {count !== undefined && <span className="text-sm font-normal text-gray-400 tabular">{count}</span>}
    </h2>
  );
}

/* ------------------------------------------------------------------ badges */

const TONES: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700",
  slate: "bg-slate-100 text-slate-600",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  blue: "bg-brand-50 text-brand-700",
  violet: "bg-violet-50 text-violet-700",
  sky: "bg-sky-50 text-sky-700",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Status = colored dot + text label (never color alone). */
export function StatusBadge({ status }: { status: LessonStatus }) {
  useI18n(); // re-render on language change
  const meta = statusMeta()[status];
  return (
    <span
      title={meta.hint}
      className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-medium leading-none", TONES[meta.tone])}
    >
      <i className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {meta.label}
    </span>
  );
}

/* ------------------------------------------------------------------ avatar */

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").slice(0, 2).map((p) => p[0]).join("");
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-50 font-semibold text-brand-700",
        size === "sm" ? "size-8 text-xs" : "size-9 text-sm",
      )}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ loading */

export function Spinner({ label }: { label?: string }) {
  const c = useI18n().t.common;
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label ?? c.loading}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-shimmer rounded-lg bg-gray-200/70", className)} />;
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  const c = useI18n().t.common;
  return (
    <div className="space-y-3" role="status" aria-label={c.loading}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="p-5">
          <div className="flex justify-between gap-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  const c = useI18n().t.common;
  return (
    <div className={clsx("divide-y divide-gray-100", className)} role="status" aria-label={c.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="size-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  const c = useI18n().t.common;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label={c.loading}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-3 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-28" />
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ empty / error */

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 [&>svg]:size-6">{icon}</div>}
      <p className="font-medium text-gray-900">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm leading-relaxed text-gray-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const c = useI18n().t.common;
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{error instanceof Error ? error.message : String(error)}</div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
          <RotateCw className="size-3.5" aria-hidden /> {c.actions.retry}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ form controls */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | false | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 flex items-center gap-1 text-xs text-red-600" role="alert">
          <AlertCircle className="size-3.5" aria-hidden /> {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs leading-relaxed text-gray-500">{hint}</span>
      )}
    </label>
  );
}

const control = clsx(
  "rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-[inset_0_1px_1px_rgb(18_52_79_/_0.03)]",
  "transition-[border-color,box-shadow] duration-200 hover:border-gray-300",
  "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100",
  "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-100",
  "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
);

/** full width unless the caller sets its own width */
const width = (className?: string) => (/(^|\s)(w-|flex-1)/.test(className ?? "") ? "" : "w-full");

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(control, width(props.className), "h-10", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(control, width(props.className), "h-10 cursor-pointer pr-8", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(control, width(props.className), "py-2.5 leading-relaxed", props.className)} />;
}

/* ------------------------------------------------------------------ segmented control */

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  label?: string;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.querySelectorAll("button")[options.indexOf(next)] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div
      className={clsx("inline-flex w-full rounded-full bg-gray-900/[0.05] p-1 sm:w-auto", className)}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={clsx(
              "flex-1 rounded-full px-4 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 sm:flex-none",
              active ? "bg-white text-gray-900 shadow-card" : "text-gray-500 hover:text-gray-800",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ modal */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  persistent,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** forms: a click on the backdrop must not throw away what the user typed */
  persistent?: boolean;
}) {
  const c = useI18n().t.common;
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // focus the first field of the body (or the dialog itself) unless something inside already has focus (autoFocus)
    requestAnimationFrame(() => {
      const root = panel.current;
      if (!root || root.contains(document.activeElement)) return;
      const inBody = FOCUSABLE.split(", ").map((s) => `[data-modal-body] ${s}`).join(", ");
      (root.querySelector<HTMLElement>(inBody) ?? root).focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  // Portal to <body>: a transformed / filtered ancestor (page animation, cards) would otherwise become the
  // containing block of `position: fixed` and the dialog would be placed relative to the page content.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-900/30 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
      onMouseDown={persistent ? undefined : onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "flex max-h-[92dvh] w-full animate-fade-up flex-col rounded-t-3xl bg-white shadow-overlay outline-none sm:rounded-3xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          <button onClick={onClose} className="-mr-1 rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label={c.actions.close}>
            <X className="size-5" />
          </button>
        </div>
        <div data-modal-body className="overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ confirm dialog */

interface ConfirmOptions {
  title: string;
  text?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn>(async () => true);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const c = useI18n().t.common;
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((options) => new Promise((resolve) => setState({ ...options, resolve })), []);
  const finish = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => finish(false)}
        title={state?.title ?? ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => finish(false)}>
              {c.actions.cancel}
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => finish(true)} autoFocus>
              {state?.confirmLabel ?? c.actions.confirm}
            </Button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-gray-600">{state?.text}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** `if (await confirm({...})) doDangerousThing()` */
export const useConfirm = () => useContext(ConfirmContext);

/* ------------------------------------------------------------------ toasts */

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastContext = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useI18n().t.common;
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, tone: "ok" | "error" = "ok") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, text, tone }]);
      setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4200);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+1rem)] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={clsx(
              "pointer-events-auto flex w-full max-w-[420px] animate-fade-up items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-overlay",
              t.tone === "ok" ? "bg-gray-900 text-white" : "bg-red-600 text-white",
            )}
          >
            {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span className="flex-1 leading-relaxed">{t.text}</span>
            <button onClick={() => dismiss(t.id)} className="-mr-1 rounded-full p-0.5 opacity-70 transition hover:opacity-100" aria-label={c.dismissToast}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ------------------------------------------------------------------ misc */

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-gray-500">
        <span>{label}</span>
        <span className="text-gray-400 [&>svg]:size-4">{icon}</span>
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular">{value}</div>
      {hint && <div className="mt-2 text-xs text-gray-500">{hint}</div>}
    </Card>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-gray-500">{label}</div>
      <div className="mt-0.5 text-[15px] text-gray-900">{children}</div>
    </div>
  );
}
