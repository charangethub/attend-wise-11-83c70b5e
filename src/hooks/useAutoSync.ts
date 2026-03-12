import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export function useAutoSync() {
  const { data: settings } = useSystemSettings();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const intervalMinutes = parseInt(settings?.sync_interval_minutes ?? "0", 10);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!intervalMinutes || intervalMinutes <= 0) return;

    const doSync = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await supabase.functions.invoke("sync-google-sheet", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch (e) { console.warn("Auto-sync failed:", e); }
    };

    doSync();
    intervalRef.current = setInterval(doSync, intervalMinutes * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [settings?.sync_interval_minutes]);
}
