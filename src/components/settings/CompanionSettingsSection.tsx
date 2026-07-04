import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useRuforgeStore } from "../../store/ruforgeStore";
import {
  CompanionPairingModal,
  type CompanionQrPayload,
} from "./CompanionPairingModal";

const companionAccentBtn =
  "px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95";

const companionNeutralBtn =
  "px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-stone-300 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 active:scale-95";

type CompanionStatus = {
  running: boolean;
  port: number;
  browserUrl: string | null;
  lanIp: string | null;
  lanReachable: boolean;
  sessionCount: number;
};

export const CompanionSettingsSection: React.FC<{ active: boolean }> = ({ active }) => {
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const notify = useRuforgeStore((s) => s.notify);

  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<CompanionQrPayload | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await invoke<CompanionStatus>("companion_status");
      setStatus(next);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refreshStatus();
    const id = window.setInterval(() => void refreshStatus(), 5000);
    return () => window.clearInterval(id);
  }, [active, refreshStatus]);

  const handleAcknowledge = () => {
    void updateSetting("companionServerDisclosureAcknowledged", true);
  };

  const handleToggle = async () => {
    if (!settings.companionServerDisclosureAcknowledged) return;
    setBusy(true);
    try {
      if (status?.running) {
        await invoke("companion_stop");
        setPairing(null);
        setQrOpen(false);
      } else {
        await invoke("companion_start");
      }
      await refreshStatus();
    } catch (e) {
      notify(typeof e === "string" ? e : "Companion server request failed.");
    } finally {
      setBusy(false);
    }
  };

  const mintPairing = useCallback(async () => {
    const payload = await invoke<CompanionQrPayload>("companion_qr_payload");
    setPairing(payload);
    return payload;
  }, []);

  const handleRefreshPairing = async () => {
    setBusy(true);
    try {
      await mintPairing();
      notify("Pairing link refreshed.");
    } catch (e) {
      notify(typeof e === "string" ? e : "Could not mint pairing link.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!pairing?.url) return;
    try {
      await navigator.clipboard.writeText(pairing.url);
      notify("Pairing link copied.");
    } catch {
      notify("Could not copy pairing link.");
    }
  };

  const handleOpenWeb = async () => {
    setBusy(true);
    try {
      const payload = pairing ?? (await mintPairing());
      await openUrl(payload.url);
    } catch (e) {
      notify(typeof e === "string" ? e : "Could not open companion link.");
    } finally {
      setBusy(false);
    }
  };

  const handleShowQr = async () => {
    setBusy(true);
    try {
      if (!pairing) await mintPairing();
      setQrOpen(true);
    } catch (e) {
      notify(typeof e === "string" ? e : "Could not show pairing QR.");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenLocal = async () => {
    if (!pairing?.url) return;
    try {
      await openUrl(pairing.url);
    } catch {
      notify("Could not open companion link.");
    }
  };

  const running = status?.running === true;
  const acked = settings.companionServerDisclosureAcknowledged === true;
  const statusLine = running
    ? `${status?.browserUrl ?? `http://localhost:${status?.port ?? "?"}`} (${status?.sessionCount ?? 0} paired)`
    : "Stopped";

  return (
    <section className="rf-settings-section">
      <h3 className="rf-settings-section-header">Browser companion (same PC)</h3>
      <div className="flex flex-col gap-4 px-1">
        <p className="text-[11px] leading-relaxed text-stone-400 max-w-2xl">
          When enabled, RuForge runs a small HTTP server on this PC only
          (`127.0.0.1`). Your default browser can browse and stream files you
          already downloaded. Nothing is exposed to your Wi-Fi or the internet.
          Use Open in web from this screen; RuForge opens the correct localhost
          URL with a one-time pairing link. LAN, phone, and TV access are not
          part of V1.
        </p>

        {!acked ? (
          <button
            type="button"
            onClick={handleAcknowledge}
            className="self-start px-4 py-2 rounded-xl text-[10px] font-black tracking-widest bg-[#1D1613] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] text-[color:var(--accent)] hover:bg-stone-800 transition-colors"
          >
            I UNDERSTAND, SHOW CONTROLS
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 max-w-2xl">
              <div>
                <p className="text-sm font-semibold text-stone-200">Companion server</p>
                <p className="text-[11px] text-stone-500 mt-1">{statusLine}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleToggle()}
                className={`w-12 h-6 rounded-full relative transition-all duration-300 border border-white/[0.05] disabled:opacity-50 ${
                  running
                    ? "bg-[#2A1E1A] shadow-[0_2px_5px_rgba(0,0,0,0.5)]"
                    : "bg-[#1D1613] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
                }`}
                aria-pressed={running}
                aria-label={running ? "Stop companion server" : "Start companion server"}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-[color:var(--accent)] shadow-md transition-all duration-300 ${
                    running ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>

            {running ? (
              <div className="flex flex-col gap-2 max-w-2xl">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOpenWeb()}
                    className={companionAccentBtn}
                  >
                    OPEN IN WEB
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRefreshPairing()}
                    className={companionNeutralBtn}
                  >
                    REFRESH PAIRING LINK
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed text-stone-600">
                  Advanced: QR encodes the same localhost pairing link for manual
                  open or future LAN work. Not required for same-PC use.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleShowQr()}
                  className={`self-start ${companionNeutralBtn}`}
                >
                  SHOW PAIRING QR
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <CompanionPairingModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        pairing={pairing}
        busy={busy}
        onRefresh={() => void handleRefreshPairing()}
        onCopyLink={() => void handleCopyUrl()}
        onOpenLocal={() => void handleOpenLocal()}
      />
    </section>
  );
};
