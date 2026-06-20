import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  CrashRecoveryScreen,
  type CrashRecoveryVariant,
} from "./crash-recovery/CrashRecoveryScreen";

type Props = {
  children: ReactNode;
  variant?: CrashRecoveryVariant;
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

    const error = this.state.error;
    const message = error?.message ?? "Unknown error";
    const errorName = error?.name;
    const componentStack = this.state.errorInfo?.componentStack?.trim() ?? "";
    const errorStack = error?.stack?.trim() ?? "";
    const detail =
      componentStack
      || errorStack
      || "No stack trace available.";
    const copyDetail =
      componentStack && errorStack && componentStack !== errorStack
        ? `${componentStack}\n\n${errorStack}`
        : undefined;

    return (
      <CrashRecoveryScreen
        variant={this.props.variant ?? "ui"}
        message={message}
        errorName={errorName}
        detail={detail}
        copyDetail={copyDetail}
        onReload={this.handleReload}
      />
    );
  }
}
