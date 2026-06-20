import { invoke } from "@tauri-apps/api/core";

export async function copyDevCapturePngBytesToClipboard(bytes: Uint8Array): Promise<void> {
  const blob = new Blob([bytes], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function copyDevCapturePngToClipboard(path: string): Promise<void> {
  const bytes = await invoke<number[]>("read_dev_capture_png", { path });
  await copyDevCapturePngBytesToClipboard(Uint8Array.from(bytes));
}
