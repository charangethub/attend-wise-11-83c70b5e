import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type UsePageDatasetResult = {
  datasetSlug: string;
  datasetName: string;
  loading: boolean;
  refetch: () => void;
};

/**
 * Returns the dataset mapped to a specific page via page_dataset_mapping.
 * Falls back to the active dataset from student_datasets if no mapping exists.
 */
export function usePageDataset(pageName: string): UsePageDatasetResult {
  const [datasetSlug, setDatasetSlug] = useState<string>("");
  const [datasetName, setDatasetName] = useState<string>("Students");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const fetchMapping = useCallback(async () => {
    setLoading(true);
    try {
      // Try page-specific mapping first
      const { data: mapping } = await supabase
        .from("page_dataset_mapping")
        .select("dataset_slug, dataset_name")
        .eq("page_name", pageName)
        .limit(1)
        .maybeSingle();

      if (mapping && (mapping as any).dataset_slug) {
        setDatasetSlug((mapping as any).dataset_slug);
        setDatasetName((mapping as any).dataset_name || "Students");
        setLoading(false);
        return;
      }

      // Fallback: active dataset
      const { data: active } = await supabase
        .from("student_datasets")
        .select("slug, name")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (active) {
        setDatasetSlug((active as any).slug);
        setDatasetName((active as any).name);
      } else {
        setDatasetSlug("");
        setDatasetName("Students");
      }
    } catch {
      setDatasetSlug("");
      setDatasetName("Students");
    }
    setLoading(false);
  }, [pageName]);

  useEffect(() => {
    void fetchMapping();
  }, [fetchMapping, tick]);

  // Listen for mapping changes
  useEffect(() => {
    const channel = supabase
      .channel(`page-dataset-${pageName}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "page_dataset_mapping" }, () => {
        void fetchMapping();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMapping, pageName]);

  return {
    datasetSlug,
    datasetName,
    loading,
    refetch: () => setTick(t => t + 1),
  };
}
