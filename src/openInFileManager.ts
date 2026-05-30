import { invoke } from "@tauri-apps/api/core";

export async function openInFileManager(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed) return;
  await invoke("open_in_file_manager", { path: trimmed });
}
