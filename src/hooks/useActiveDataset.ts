import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type UseActiveDatasetResult = {
  activeSlug: string;
  activeName: string;
  loading: boolean;
  refetch: () => void;
};

export function useActiveDataset(): UseActiveDatasetResult {
  const [activeSlug, setActiveSlug] = useState<string>("master_list_adilabad");
  const [activeName, setActiveName] = useState<string>("Students");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fetchDS = async () => {
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
    };
    fetchDS();
  }, [tick]);

  return { activeSlug, activeName, loading, refetch: () => setTick(t => t + 1) };
}
