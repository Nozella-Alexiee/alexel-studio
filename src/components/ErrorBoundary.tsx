import { Component, type ReactNode } from "react";
import { tl } from "../i18n";

/** Jaring pengaman: error tak terduga di satu bagian UI tidak membuat layar hitam. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Nozel UI error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty" role="alert">
        <div className="empty-title">{this.props.label ?? "Bagian ini mengalami error"}</div>
        <div className="empty-body mono">{this.state.error.message}</div>
        <div className="empty-action">
          <button
            className="btn btn-primary"
            onClick={() => {
              this.props.onReset?.();
              this.setState({ error: null });
            }}
          >
            {tl("Coba lagi")}
          </button>
        </div>
      </div>
    );
  }
}
