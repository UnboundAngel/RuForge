import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRuforgeStore } from "../../store/ruforgeStore";

type CompanionStatus = {
  running: boolean;
  port: number;
  lanIp: string | null;
  lanReachable: boolean;
  sessionCount: number;
};

type QrPayload = {
  url: string;
  ip: string;
  port: number;
  code: string;
  expSecs: number;
};

export const CompanionSettingsSection: React.FC<{ active: boolean }> = ({ active }) => {
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const notify = useRuforgeStore((s) => s.notify);

  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<QrPayload | null>(null);

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

  const handleRefreshPairing = async () => {
    setBusy(true);
    try {
      const payload = await invoke<QrPayload>("companion_qr_payload");
      setPairing(payload);
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

  const running = status?.running === true;
  const acked = settings.companionServerDisclosureAcknowledged === true;
  const statusLine = running
    ? status?.lanIp
      ? `Running on ${status.lanIp}:${status.port} (${status.sessionCount} paired)`
      : `Running on port ${status?.port ?? "?"} (LAN IP unavailable)`
    : "Stopped";

  return (
    <section className="rf-settings-section">
      <h3 className="rf-settings-section-header">LAN companion (TV browser)</h3>
      <div className="flex flex-col gap-4 px-1">
        <p className="text-[11px] leading-relaxed text-stone-400 max-w-2xl">
          When enabled, RuForge opens a small HTTP server on your local network so a TV or
          phone browser on the same Wi-Fi can browse and stream files you already downloaded.
          It does not expose RuForge to the internet. Windows may ask to allow RuForge through
          the firewall the first time you enable this. Pairing requires scanning a link from
          this screen; nothing is reachable until you turn the server on.
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
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRefreshPairing()}
                  className="self-start px-4 py-2 rounded-xl text-[10px] font-black tracking-widest bg-[#1D1613] border border-white/10 text-stone-300 hover:bg-stone-800 disabled:opacity-50 transition-colors"
                >
                  {pairing ? "REFRESH PAIRING LINK" : "SHOW PAIRING LINK"}
                </button>
                {pairing ? (
                  <div className="rounded-xl border border-white/10 bg-[#12100f] p-3">
                    <p className="text-[10px] uppercase tracking-widest text-stone-500 mb-2">
                      Open on your TV browser
                    </p>
                    <p className="text-xs font-mono text-stone-300 break-all">{pairing.url}</p>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl()}
                      className="mt-2 text-[10px] font-black tracking-widest text-[color:var(--accent)] hover:underline"
                    >
                      COPY LINK
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};
