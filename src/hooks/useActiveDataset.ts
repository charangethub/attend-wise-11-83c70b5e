import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type UseActiveDatasetResult = {
  activeSlug: string;
  activeName: string;
  loading: boolean;
  refetch: () => void;
};

let cachedSlug: string | null = null;
let cachedName: string | null = null;

export function useActiveDataset(): UseActiveDatasetResult {
  const [activeSlug, setActiveSlug] = useState<string>(cachedSlug || "master_list_adilabad");
  const [activeName, setActiveName] = useState<string>(cachedName || "Students");
  const [loading, setLoading] = useState(!cachedSlug);
  const [tick, setTick] = useState(0);
  const fetched = useRef(!!cachedSlug);

  useEffect(() => {
    if (fetched.current && tick === 0) return;
    const fetchDS = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("student_datasets")
        .select("slug, name")
        .eq("is_active", true)
        .limit(1)
        .single();
      if (!error && data) {
        cachedSlug = (data as any).slug;
        cachedName = (data as any).name;
        setActiveSlug(cachedSlug!);
        setActiveName(cachedName!);
      }
      fetched.current = true;
      setLoading(false);
    };
    fetchDS();
  }, [tick]);

  return { activeSlug, activeName, loading, refetch: () => setTick(t => t + 1) };
}
