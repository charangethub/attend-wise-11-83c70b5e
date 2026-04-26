import { supabase } from "@/integrations/supabase/client";

export async function queueAttendanceSheetSync(date: string, only?: string[]) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data, error } = await supabase.functions.invoke("sync-to-sheet", {
    body: { date, ...(only ? { only } : {}) },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) throw error;
  return data;
}