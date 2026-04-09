import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface CallHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
}

const CallHistoryDialog = ({ open, onOpenChange, studentId, studentName }: CallHistoryDialogProps) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    supabase
      .from("call_logs" as any)
      .select("*")
      .eq("student_id", studentId)
      .order("absent_date", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setLogs((data as any[]) ?? []);
        setLoading(false);
      });
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Call History — {studentName}</DialogTitle>
          <DialogDescription>All previous call logs for this student</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No call logs found</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log: any) => (
              <div key={log.id} className="rounded-lg border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{format(new Date(log.absent_date + "T00:00:00"), "dd MMM yyyy")}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    log.call_status === "Called" ? "bg-success/20 text-success" :
                    log.call_status === "Not Reachable" ? "bg-warning/20 text-warning" :
                    "bg-primary/20 text-primary"
                  }`}>{log.call_status}</span>
                </div>
                <p className="text-xs text-muted-foreground">Reason: <span className="text-foreground">{log.absence_reason || "—"}</span></p>
                {log.comment && <p className="text-xs text-muted-foreground">Comment: <span className="text-foreground">{log.comment}</span></p>}
                {log.expected_return_date && (
                  <p className="text-xs text-muted-foreground">Expected Return: <span className="text-foreground">{format(new Date(log.expected_return_date + "T00:00:00"), "dd MMM yyyy")}</span></p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CallHistoryDialog;
