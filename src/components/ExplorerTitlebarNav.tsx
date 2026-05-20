import { Icon } from "@iconify/react";
import { TitlebarHoverButton } from "./TitlebarHoverButton";

type ExplorerTitlebarNavProps = {
  /** Pixel offset from window left — must match sidebar width (80 collapsed / 240 expanded). */
  left: number;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
};

/**
 * Explorer back / forward / reload in the top title band, flush at the sidebar→content seam.
 * Must stay `fixed` + z-[100] — the embedded explorer webview covers in-tab DOM.
 */
export function ExplorerTitlebarNav({
  left,
  onBack,
  onForward,
  onReload,
}: ExplorerTitlebarNavProps) {
  return (
    <div
      className="pointer-events-auto fixed top-0 z-[100] flex h-10 items-center gap-0.5 transition-[left] duration-500 ease-[0.23,1,0.32,1]"
      style={{ left }}
    >
      <TitlebarHoverButton tooltip="Back" onClick={onBack}>
        <Icon icon="material-symbols:arrow-back-ios-rounded" fontSize={14} />
      </TitlebarHoverButton>
      <TitlebarHoverButton tooltip="Forward" onClick={onForward}>
        <Icon icon="material-symbols:arrow-forward-ios-rounded" fontSize={14} />
      </TitlebarHoverButton>
      <TitlebarHoverButton tooltip="Reload" onClick={onReload}>
        <Icon icon="material-symbols:refresh" fontSize={16} />
      </TitlebarHoverButton>
    </div>
  );
}
