import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type UseActiveDatasetResult = {
  activeSlug: string;
  activeName: string;
  loading: boolean;
  refetch: () => void;
};

export function useActiveDataset(): UseActiveDatasetResult {
  const [activeSlug, setActiveSlug] = useState<string>("");
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
    } else {
      setActiveSlug("");
      setActiveName("Students");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDS();
  }, [fetchDS, tick]);

  useEffect(() => {
    const channelName = `dataset-active-change-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "student_datasets",
        },
        () => {
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
