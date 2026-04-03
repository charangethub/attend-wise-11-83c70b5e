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
  debounceMs = 500,
  watchStudents = true,
}: UseAttendanceAutoRefreshOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void onRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled, onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (debounceMs <= 0) {
        void onRefresh();
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void onRefresh();
      }, debounceMs);
    };

    const attendanceChannel = supabase
      .channel(`${channelKey}:${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance" },
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