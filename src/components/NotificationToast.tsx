import React from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "error" | "success" | "info";
  message: string;
}

interface NotificationToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 34,
        right: 18,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 2000,
        maxWidth: 400,
      }}
    >
      {toasts.map((toast) => {
        const isError = toast.type === "error";
        const isSuccess = toast.type === "success";

        return (
          <div
            key={toast.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg-modal)",
              border: `1px solid ${
                isError
                  ? "var(--danger-color)"
                  : isSuccess
                  ? "var(--success-color)"
                  : "var(--border-strong)"
              }`,
              boxShadow: "var(--shadow-popup)",
              fontSize: 12.5,
              color: "var(--text-main)",
            }}
          >
            {isError ? (
              <AlertCircle size={16} color="var(--danger-color)" style={{ flexShrink: 0 }} />
            ) : isSuccess ? (
              <CheckCircle2 size={16} color="var(--success-color)" style={{ flexShrink: 0 }} />
            ) : null}

            <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>

            <button
              className="btn-icon"
              style={{ padding: 2 }}
              onClick={() => onDismiss(toast.id)}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
