import { useEffect, useRef } from "react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { queueAttendanceSheetSync } from "@/lib/sheetSync";

export function useAutoSync() {
  const { data: settings } = useSystemSettings();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const MIN_SYNC_INTERVAL_MINUTES = 30;
    const configured = parseFloat(settings?.sync_interval_minutes ?? "0");
    const intervalMinutes = configured > 0 ? Math.max(MIN_SYNC_INTERVAL_MINUTES, configured) : 0;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!intervalMinutes || intervalMinutes <= 0) return;
    const safeIntervalMinutes = intervalMinutes;

    const doSync = async () => {
      if (document.hidden) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const today = new Date().toISOString().slice(0, 10);
        await queueAttendanceSheetSync(today);
      } catch (e) { console.warn("Auto-sync failed:", e); }
      finally { inFlightRef.current = false; }
    };

    intervalRef.current = setInterval(doSync, safeIntervalMinutes * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [settings?.sync_interval_minutes]);
}
