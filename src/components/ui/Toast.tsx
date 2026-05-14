import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastStatus = "success" | "error";

interface ToastMessage {
  id: number;
  msg: string;
  status: ToastStatus;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (msg: string, status?: ToastStatus) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((msg: string, status: ToastStatus = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, msg, status, exiting: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
    }, 2700);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const isError = t.status === "error";
          const borderColor = isError ? "var(--status-broken)" : "var(--status-linked)";
          const bgColor = isError ? "color-mix(in srgb, var(--status-broken) 15%, var(--bg-surface))" : "color-mix(in srgb, var(--status-linked) 15%, var(--bg-surface))";
          const textColor = isError ? "var(--status-broken)" : "var(--status-linked)";
          return (
            <div
              key={t.id}
              className={[
                "px-4 py-2 rounded-radius-lg shadow-[var(--shadow-md)] text-sm font-medium",
                "pointer-events-auto border-l-[3px]",
                t.exiting
                  ? "animate-[toast-out_200ms_var(--ease-in)_forwards]"
                  : "animate-[toast-in_300ms_var(--ease-bounce)]",
              ].join(" ")}
              style={{ borderLeftColor: borderColor, backgroundColor: bgColor, color: textColor }}
            >
              {t.msg}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
