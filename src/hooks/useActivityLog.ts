import { supabase } from "@/integrations/supabase/client";

interface LogEntry {
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  entityType?: string;
  entityId?: string;
  studentName?: string;
  studentId?: string;
  details?: Record<string, any>;
}

export async function logActivity(entry: LogEntry) {
  try {
    await supabase.from("activity_logs").insert({
      user_id: entry.userId,
      user_email: entry.userEmail,
      user_name: entry.userName,
      action: entry.action,
      entity_type: entry.entityType ?? "attendance",
      entity_id: entry.entityId,
      student_name: entry.studentName,
      student_id: entry.studentId,
      details: entry.details ?? {},
    } as any);
  } catch (e) {
    console.error("Failed to log activity:", e);
  }
}
