import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { useI18n } from "../../i18n/I18nProvider";

type ToastStatus = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastMessage {
  id: number;
  dedupeKey: string | null;
  msg: string;
  status: ToastStatus;
  persistent: boolean;
  action: ToastAction | null;
  exiting: boolean;
}

interface ToastOptions {
  persistent?: boolean;
  dedupeKey?: string;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (msg: string, status?: ToastStatus, options?: ToastOptions) => void;
  dismissToast: (dedupeKey: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {}, dismissToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t: translate } = useI18n();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dismissedKeysRef = useRef(new Set<string>());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((toast) => (
      toast.id === id ? { ...toast, exiting: true } : toast
    )));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 200);
  }, []);

  const showToast = useCallback((msg: string, status: ToastStatus = "success", options: ToastOptions = {}) => {
    const dedupeKey = options.dedupeKey ?? null;
    if (dedupeKey && dismissedKeysRef.current.has(dedupeKey)) return;

    const id = nextId++;
    setToasts((prev) => {
      const existing = dedupeKey ? prev.find((toast) => toast.dedupeKey === dedupeKey) : null;
      if (existing) {
        return prev.map((toast) => toast.id === existing.id
          ? { ...toast, msg, status, persistent: options.persistent ?? false, action: options.action ?? null, exiting: false }
          : toast
        );
      }
      return [...prev, {
        id,
        dedupeKey,
        msg,
        status,
        persistent: options.persistent ?? false,
        action: options.action ?? null,
        exiting: false,
      }];
    });

    if (!options.persistent) {
      window.setTimeout(() => removeToast(id), 2800);
    }
  }, [removeToast]);

  const dismissToast = useCallback((dedupeKey: string) => {
    setToasts((prev) => {
      const match = prev.find((toast) => toast.dedupeKey === dedupeKey);
      if (match) window.setTimeout(() => removeToast(match.id), 0);
      return prev;
    });
  }, [removeToast]);

  const handleManualDismiss = useCallback((toast: ToastMessage) => {
    if (toast.dedupeKey) dismissedKeysRef.current.add(toast.dedupeKey);
    removeToast(toast.id);
  }, [removeToast]);

  const handleAction = useCallback((toast: ToastMessage) => {
    toast.action?.onClick();
    removeToast(toast.id);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const isError = t.status === "error";
          const borderColor = isError
            ? "var(--status-broken)"
            : t.status === "info"
              ? "var(--accent-sky)"
              : "var(--status-linked)";
          return (
            <div
              key={t.id}
              className={[
                "flex items-center min-h-10 max-w-[min(560px,calc(100vw-2rem))] rounded-sm bg-bg-elevated shadow-[var(--shadow-md)] overflow-hidden",
                "pointer-events-auto",
                t.exiting
                  ? "animate-[toast-out_200ms_var(--ease-in)_forwards]"
                  : "animate-[toast-in_300ms_var(--ease-bounce)]",
              ].join(" ")}
            >
              <div className="w-1 self-stretch flex-shrink-0" style={{ backgroundColor: borderColor }} />
              <div className="pl-3 pr-3 py-2 text-[13px] text-text-primary leading-5">
                {t.msg}
              </div>
              {t.action && (
                <Button variant="ghost" size="sm" onClick={() => handleAction(t)} className="mr-1 shrink-0">
                  {t.action.label}
                </Button>
              )}
              {t.persistent && (
                <Button
                  variant="icon"
                  onClick={() => handleManualDismiss(t)}
                  className="mx-1 shrink-0"
                  aria-label={translate("common.close")}
                  title={translate("common.close")}
                >
                  ×
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
