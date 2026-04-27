import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type UseAttendanceAutoRefreshOptions = {
  enabled?: boolean;
  channelKey: string;
  onRefresh: () => void | Promise<void>;
  exactDate?: string;
  fromDate?: string;
  toDate?: string;
  session?: string;
  debounceMs?: number;
  watchStudents?: boolean;
};

export function useAttendanceAutoRefresh({
  enabled = true,
  channelKey,
  onRefresh,
  exactDate,
  fromDate,
  toDate,
  session,
  debounceMs = 1500,
  watchStudents = false,
}: UseAttendanceAutoRefreshOptions) {
  useEffect(() => {
    if (!enabled) return;

    // Cooldown: don't refresh more than once every 30s on visibility change.
    // This prevents every tab-switch from triggering a full Sheet sync.
    let lastVisibilityRefresh = 0;
    const VISIBILITY_COOLDOWN_MS = 30_000;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        if (now - lastVisibilityRefresh < VISIBILITY_COOLDOWN_MS) return;
        lastVisibilityRefresh = now;
        void onRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled, onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRefreshAt = 0;
    const MIN_REFRESH_INTERVAL_MS = 3000;

    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      const sinceLast = Date.now() - lastRefreshAt;
      const wait = Math.max(debounceMs, MIN_REFRESH_INTERVAL_MS - sinceLast);
      debounceTimer = setTimeout(() => {
        lastRefreshAt = Date.now();
        void onRefresh();
      }, wait);
    };

    // Server-side filter by date when possible so other dates' edits never reach this client.
    const attendanceFilter = exactDate ? `date=eq.${exactDate}` : undefined;

    const channelName = `attendance-refresh:${channelKey}`;
    supabase.getChannels().filter((c: any) => c.topic === `realtime:${channelName}`).forEach((c) => supabase.removeChannel(c));
    const attendanceChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", ...(attendanceFilter ? { filter: attendanceFilter } : {}) },
        (payload: any) => {
          const record = payload.new ?? payload.old ?? {};
          const recordDate = record.date as string | undefined;

          if (exactDate && recordDate && recordDate !== exactDate) return;
          if (fromDate && recordDate && recordDate < fromDate) return;
          if (toDate && recordDate && recordDate > toDate) return;
          if (session && record.session && record.session !== session) return;

          scheduleRefresh();
        },
      );

    const channel = watchStudents
      ? attendanceChannel.on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => {
          scheduleRefresh();
        })
      : attendanceChannel;

    const subscription = channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(subscription);
    };
  }, [enabled, channelKey, onRefresh, exactDate, fromDate, toDate, session, debounceMs, watchStudents]);
}