import React from "react";
import { UnsavedConfirmState } from "../types";
import { AlertTriangle } from "lucide-react";

interface UnsavedDialogProps {
  state: UnsavedConfirmState;
  onClose: () => void;
}

export const UnsavedDialog: React.FC<UnsavedDialogProps> = ({ state, onClose }) => {
  if (!state.isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(245, 158, 11, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--dirty-indicator)",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="modal-title">Unsaved Changes</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Do you want to save changes to <strong>{state.fileName || "this file"}</strong>?
            </p>
          </div>
        </div>

        <p className="modal-body">
          If you close this file without saving, any modifications you made will be permanently lost.
        </p>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-secondary"
            style={{ color: "var(--danger-color)" }}
            onClick={() => {
              if (state.onDiscardAndClose) state.onDiscardAndClose();
              onClose();
            }}
          >
            Don&apos;t Save
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              if (state.onSaveAndClose) state.onSaveAndClose();
              onClose();
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
