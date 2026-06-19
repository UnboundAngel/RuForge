import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

import { markTelemetryConsentSeen } from "@/lib/telemetryConsentStorage";
import { getOrCreateInstallId } from "@/lib/telemetryInstallId";
import { useRuforgeStore } from "@/store/ruforgeStore";

type TelemetryConsentOverlayProps = {
  onComplete: () => void;
};

function ConsentToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 w-12 rounded-full relative cursor-pointer transition-all duration-300 border border-white/[0.05] ${
        active
          ? "bg-[#2A1E1A] shadow-[0_2px_5px_rgba(0,0,0,0.5)]"
          : "bg-[#1D1613] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
      }`}
    >
      <motion.div
        animate={{ x: active ? 26 : 2 }}
        transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full transition-colors duration-300 ${
          active ? "bg-[color:var(--accent)]" : "bg-stone-700"
        }`}
      />
    </button>
  );
}

export function TelemetryConsentOverlay({ onComplete }: TelemetryConsentOverlayProps) {
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const [usageOn, setUsageOn] = useState(false);
  const [crashOn, setCrashOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    markTelemetryConsentSeen();
    onComplete();
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateSetting("telemetryUsageEnabled", usageOn);
      await updateSetting("telemetryCrashEnabled", crashOn);
      if (usageOn || crashOn) {
        getOrCreateInstallId();
      }
      finish();
    } finally {
      setBusy(false);
    }
  };

  const handleNotNow = () => {
    if (busy) return;
    finish();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[145] flex items-center justify-center overflow-hidden p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-[#12100e]/80 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#271C18] p-8 shadow-[0_32px_64px_rgba(0,0,0,0.6)]"
        >
          <div className="mb-6 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
              Privacy
            </p>
            <h2 className="text-xl font-bold text-stone-100">Telemetry</h2>
            <p className="text-sm text-stone-500">
              Optional. Both channels are off unless you turn them on.
            </p>
          </div>

          <div className="mb-8 space-y-6">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-stone-100">Usage telemetry</h3>
                <p className="text-[11px] leading-relaxed text-stone-500">
                  Counts launches and grabs the basics: OS, app version, language. What you download
                  never touches it.
                </p>
              </div>
              <ConsentToggle active={usageOn} onClick={() => setUsageOn((v) => !v)} />
            </div>
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-stone-100">Crash reports</h3>
                <p className="text-[11px] leading-relaxed text-stone-500">
                  When something breaks, it sends me the crash, scrubbed clean first so no links or
                  filenames ride along.
                </p>
              </div>
              <ConsentToggle active={crashOn} onClick={() => setCrashOn((v) => !v)} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={busy}
              onClick={handleNotNow}
              className="px-6 py-3 rounded-full border border-white/10 bg-white/5 text-[11px] font-black uppercase tracking-widest text-stone-400 transition-colors duration-200 hover:bg-white/10 hover:text-stone-100 disabled:opacity-50"
            >
              Not now
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={busy}
              onClick={() => void handleSave()}
              className="px-10 py-3 rounded-full bg-[color:var(--accent)] text-[11px] font-black uppercase tracking-widest text-[#1D1613] transition-transform duration-200 disabled:opacity-50"
            >
              Save
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
