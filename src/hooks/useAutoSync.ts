import { useEffect, useRef } from "react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { queueAttendanceSheetSync } from "@/lib/sheetSync";

export function useAutoSync() {
  const { data: settings } = useSystemSettings();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const intervalMinutes = parseFloat(settings?.sync_interval_minutes ?? "0");
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!intervalMinutes || intervalMinutes <= 0) return;

    const doSync = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        await queueAttendanceSheetSync(today);
      } catch (e) { console.warn("Auto-sync failed:", e); }
    };

    doSync();
    intervalRef.current = setInterval(doSync, intervalMinutes * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [settings?.sync_interval_minutes]);
}
