import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSystemSettings() {
  return useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("system_settings").select("key, value");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
    staleTime: 30 * 1000,
  });
}
