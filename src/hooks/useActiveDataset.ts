import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type UseActiveDatasetResult = {
  activeSlug: string;
  activeName: string;
  loading: boolean;
  refetch: () => void;
};

// ✅ FIX (Bug 4): Removed the module-level cache variables:
//   let cachedSlug: string | null = null;
//   let cachedName: string | null = null;
//
// These were JavaScript module-level singletons that persisted across the
// whole session. When the admin switched the active dataset from the Admin Panel,
// no other user would see the change because cachedSlug was still the old value
// and the `fetched.current && tick === 0` guard blocked all re-fetches.
//
// New approach:
// 1. Always fetch from DB on mount (fast, only one row returned)
// 2. Use a Supabase Realtime subscription on student_datasets.
//    When admin flips is_active on any row, ALL connected users
//    automatically see the new dataset within ~1 second.

export function useActiveDataset(): UseActiveDatasetResult {
  const [activeSlug, setActiveSlug] = useState<string>("master_list_adilabad");
  const [activeName, setActiveName] = useState<string>("Students");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const fetchDS = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("student_datasets")
      .select("slug, name")
      .eq("is_active", true)
      .limit(1)
      .single();
    if (!error && data) {
      setActiveSlug((data as any).slug);
      setActiveName((data as any).name);
    }
    setLoading(false);
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchDS();
  }, [fetchDS, tick]);

  // ✅ FIX (Bug 4): Realtime subscription on student_datasets.
  // When admin changes is_active (switches dataset), this fires immediately
  // and refreshes the active dataset for ALL connected users.
  useEffect(() => {
    const channel = supabase
      .channel("dataset-active-change")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "student_datasets",
        },
        () => {
          // Admin changed is_active — re-fetch the active dataset
          void fetchDS();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDS]);

  return {
    activeSlug,
    activeName,
    loading,
    refetch: () => setTick((t) => t + 1),
  };
}
