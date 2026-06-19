import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[RuForge] React render error", error, errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message ?? "Unknown error";
    const detail =
      this.state.errorInfo?.componentStack?.trim()
      || this.state.error?.stack?.trim()
      || "No stack trace available.";

    return (
      <div
        className="fixed inset-0 z-[100000] flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 20% 0%, var(--accent-glow), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 100%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 65%)",
          }}
        />
        <div className="relative z-10 flex w-full max-w-md flex-col items-center px-8 text-center">
          <p
            className="m-0 text-[0.6875rem] font-medium uppercase tracking-[0.28em]"
            style={{ color: "var(--text-muted)" }}
          >
            RuForge
          </p>
          <h1 className="mt-4 mb-2 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            something broke in the UI
          </h1>
          <p className="m-0 mb-8 max-w-xs text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            the app hit an unexpected error. reload usually fixes it.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="h-11 px-8 text-[10px] font-black uppercase tracking-[0.2em] transition-transform active:scale-[0.97]"
            style={{
              borderRadius: "var(--radius-input)",
              backgroundColor: "var(--accent)",
              color: "#110D0B",
            }}
          >
            Reload
          </button>
          <details className="mt-10 w-full max-w-sm text-left">
            <summary
              className="cursor-pointer list-none text-[10px] font-medium uppercase tracking-[0.18em] [&::-webkit-details-marker]:hidden"
              style={{ color: "var(--text-muted)" }}
            >
              error details
            </summary>
            <div
              className="mt-3 max-h-48 overflow-auto rounded-[var(--radius-input)] p-4 text-left text-[11px] leading-relaxed whitespace-pre-wrap break-words rf-scrollbar"
              style={{
                backgroundColor: "var(--surface-elevated)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              <p className="m-0 mb-3 font-medium" style={{ color: "var(--text)" }}>
                {message}
              </p>
              <pre className="m-0 font-mono text-[10px] leading-snug">{detail}</pre>
            </div>
          </details>
        </div>
      </div>
    );
  }
}
