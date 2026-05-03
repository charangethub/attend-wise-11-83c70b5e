import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ResultsTestGroup = { name: string; subHeaders: string[]; maxMarks?: number[] };
export type ResultsStudent = {
  info: Record<string, string>;
  results: Record<string, Record<string, string>>;
};
export type ResultsData = {
  studentInfoColumns: string[];
  testGroups: ResultsTestGroup[];
  testNames: string[];
  students: ResultsStudent[];
  totalStudents: number;
  gidUsed: string;
  maxMarksRowDetected?: boolean;
  fetchedAt?: string;
  error?: string;
};

export function useResultsData(datasetSlug?: string) {
  return useQuery<ResultsData>({
    queryKey: ["results-data", datasetSlug ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-results-data", {
        body: datasetSlug ? { dataset_slug: datasetSlug } : {},
      });
      if (error) throw new Error(error.message ?? "Failed to fetch results data");
      return data as ResultsData;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    retry: 3,
  });
}