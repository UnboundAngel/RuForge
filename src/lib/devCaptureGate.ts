export function isDevCaptureEnabled(showDebuggingSettings: boolean): boolean {
  return import.meta.env.DEV && showDebuggingSettings === true;
}
