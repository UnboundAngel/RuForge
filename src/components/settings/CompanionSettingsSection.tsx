import React, { useCallback, useEffect, useState } from "react";
import { SettingsDescription } from "./settingsDescription";
import { SettingItem, SettingsSection } from "./settingsChrome";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useRuforgeStore } from "../../store/ruforgeStore";
import { Switch } from "../ui/Switch";
import {
  CompanionPairingModal,
  type CompanionQrPayload,
} from "./CompanionPairingModal";

const KEYWORDS = "companion browser phone iphone pair qr tailscale";

type CompanionStatus = {
  running: boolean;
  port: number;
  browserUrl: string | null;
  lanIp: string | null;
  lanReachable: boolean;
  phoneUrl: string | null;
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
    const id = window.setInterval(() => {
      void refreshStatus();
    }, 5000);
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

  // Links work once, so every copy mints a fresh one rather than reusing one Open in web spent.
  const handleCopyFreshLink = async () => {
    setBusy(true);
    try {
      const payload = await mintPairing();
      await navigator.clipboard.writeText(payload.url);
      notify("Pairing link copied. It works once, for 2 minutes.");
    } catch (e) {
      notify(typeof e === "string" ? e : "Could not copy pairing link.");
    } finally {
      setBusy(false);
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
      await mintPairing();
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

  const introLong = `When enabled, RuForge runs a small HTTP server on this PC only (127.0.0.1). Your browser can browse and stream files you already downloaded. Nothing is exposed to your Wi-Fi or the internet. To use it on your phone, install Tailscale on this PC and the phone, run tailscale serve --bg ${status?.port ?? 8787} once on this PC, then use Pair a phone.`;
  const phoneLine = status?.phoneUrl
    ? `Phone address: ${status.phoneUrl}`
    : "Tailscale is not running on this PC, so the QR falls back to the localhost link.";

  return (
    <SettingsSection
      variant="group"
      title="Browser companion"
      keywords={KEYWORDS}
      intro={
        <>
          <p>Local-only server for browsing your downloads from a browser or phone.</p>
          <SettingsDescription description={introLong} />
        </>
      }
    >
      {!acked ? (
        <SettingItem
          title="Companion server"
          description="Read the note above, then show the controls."
          keywords={KEYWORDS}
          control={
            <button type="button" onClick={handleAcknowledge} className="rf-settings-btn">
              I understand
            </button>
          }
        />
      ) : (
        <>
          <SettingItem
            title="Companion server"
            description={statusLine}
            keywords={KEYWORDS}
            control={
              <Switch
                checked={running}
                disabled={busy}
                onChange={() => void handleToggle()}
                label={running ? "Stop companion server" : "Start companion server"}
              />
            }
          />
          {running ? (
            <>
              <SettingItem
                title="Browser access"
                description="Open the companion in your browser or copy a fresh link."
                keywords={KEYWORDS}
                control={
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => void handleOpenWeb()} className="rf-settings-btn">
                      Open in web
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handleCopyFreshLink()} className="rf-settings-btn">
                      Copy link
                    </button>
                  </div>
                }
              />
              <SettingItem
                title="Phone"
                description={phoneLine}
                keywords={KEYWORDS}
                control={
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => void handleShowQr()} className="rf-settings-btn">
                      Pair a phone
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handleRefreshPairing()} className="rf-settings-btn">
                      Refresh link
                    </button>
                  </div>
                }
              />
            </>
          ) : null}
        </>
      )}
      <CompanionPairingModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        pairing={pairing}
        busy={busy}
        onRefresh={() => void handleRefreshPairing()}
        onCopyLink={() => void handleCopyUrl()}
        onOpenLocal={() => void handleOpenLocal()}
      />
    </SettingsSection>
  );
};
