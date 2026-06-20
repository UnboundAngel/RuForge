import { useDevCapturesList } from "../../hooks/useDevCapturesList";
import { DevCapturesGrid } from "./DevCapturesGrid";

export function DevCapturesSection() {
  const { entries, folderPath, loading, refresh } = useDevCapturesList(true);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-stone-500 leading-relaxed">
        Hover the RuForge icon in the top-left corner and click capture. Shots save
        to{" "}
        <span className="font-mono text-stone-400">{folderPath || "…"}</span>.
        Right-click the icon for edit last or this library.
      </p>
      {loading && entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500">loading…</p>
      ) : (
        <DevCapturesGrid entries={entries} onRefresh={() => void refresh()} />
      )}
    </div>
  );
}
