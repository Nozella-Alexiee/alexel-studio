import React, { useState, useEffect, useRef } from "react";
import { ModalPrompt } from "../types";
import { FilePlus, FolderPlus } from "lucide-react";

interface NewItemModalProps {
  prompt: ModalPrompt;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({
  prompt,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prompt.isOpen) {
      setName("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [prompt.isOpen]);

  if (!prompt.isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(59, 130, 246, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-color)",
              flexShrink: 0,
            }}
          >
            {prompt.type === "file" ? <FilePlus size={20} /> : <FolderPlus size={20} />}
          </div>
          <div>
            <h3 className="modal-title">{prompt.title}</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Inside: {prompt.targetDirPath}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="input-text"
            type="text"
            placeholder={prompt.type === "file" ? "e.g., App.tsx, styles.css" : "e.g., components, utils"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!name.trim()}>
              Create {prompt.type === "file" ? "File" : "Folder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
