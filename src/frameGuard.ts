// Imported first by main.tsx: a module that throws while loading stops every module after it,
// so nothing below boots. Inside a frame the app would run on a third-party page's terms
// (clickjacking, a fresh localStorage driving its startup) while Tauri treats its IPC as local.
if (window.top !== window.self) {
  throw new Error("RuForge does not run inside a frame");
}

export {};
