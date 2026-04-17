import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Save } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logActivity } from "@/hooks/useActivityLog";

const CALL_STATUSES = ["Called", "Not Reachable", "Callback Scheduled"] as const;

const ABSENCE_REASONS = [
  "School Exam",
  "Transportation",
  "Student is Sick",
  "Parent is Sick",
  "Forget About the class",
  "Out of Station",
  "School Event",
  "Not Reachable",
  "Hostel Unavailability",
  "Student Wants to Drop",
  "Personal Work",
  "Family Function",
  "Medical Appointment",
  "Emergency",
  "Other",
] as const;

interface CallLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  rollNo: string;
  classroom?: string;
  absentDate: string;
  mobileNumber?: string | null;
  emergencyContact1?: string | null;
  emergencyContact2?: string | null;
  onSaved?: () => void;
  existingLog?: {
    call_status: string;
    absence_reason: string | null;
    comment: string | null;
    expected_return_date: string | null;
  } | null;
}

const CallLogDialog = ({
  open,
  onOpenChange,
  studentId,
  studentName,
  rollNo,
  classroom,
  absentDate,
  mobileNumber,
  emergencyContact1,
  emergencyContact2,
  onSaved,
  existingLog,
}: CallLogDialogProps) => {
  const { user } = useAuth();
  const [callStatus, setCallStatus] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [comment, setComment] = useState("");
  const [expectedReturn, setExpectedReturn] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCallStatus(existingLog?.call_status || "");
      setAbsenceReason(existingLog?.absence_reason || "");
      setComment(existingLog?.comment || "");
      setExpectedReturn(existingLog?.expected_return_date ? new Date(existingLog.expected_return_date + "T00:00:00") : undefined);
    }
  }, [open, existingLog]);

  const handleSave = async () => {
    if (!callStatus) {
      toast.error("Please select a call status");
      return;
    }
    if (!absenceReason) {
      toast.error("Please select an absence reason");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        student_id: studentId,
        absent_date: absentDate,
        call_status: callStatus,
        absence_reason: absenceReason,
        comment: comment.trim() || null,
        expected_return_date: expectedReturn ? format(expectedReturn, "yyyy-MM-dd") : null,
        created_by: user?.id,
      };

      const { error } = await supabase
        .from("call_logs" as any)
        .upsert(payload as any, { onConflict: "student_id,absent_date" });

      if (error) throw error;

      // Also update attendance remark with the absence reason
      const remarkText = [absenceReason, comment.trim()].filter(Boolean).join(" - ");
      await supabase
        .from("attendance")
        .update({ remark: remarkText })
        .eq("student_id", studentId)
        .eq("date", absentDate)
        .in("status", ["A", "AB", "L"]);

      toast.success("Call log saved!");

      if (user) {
        void logActivity({
          userId: user.id,
          userEmail: user.email ?? "",
          userName: user.user_metadata?.full_name ?? user.email ?? "",
          action: "call log updated",
          entityType: "call_log",
          studentName,
          studentId,
          details: { date: absentDate, call_status: callStatus, absence_reason: absenceReason },
        });
      }

      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Failed to save call log: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Call Log</DialogTitle>
          <DialogDescription className="sr-only">Update the call log for this absent student</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student Info Header */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-sm font-bold text-foreground">{studentName}</p>
            <p className="text-xs text-muted-foreground">
              {[rollNo, classroom].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Absent on: {format(new Date(absentDate + "T00:00:00"), "dd MMM yyyy")}
            </p>
            {(mobileNumber || emergencyContact1 || emergencyContact2) && (
              <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Contact Numbers</p>
                {mobileNumber && (
                  <a href={`tel:${mobileNumber}`} className="block text-xs text-primary hover:underline">
                    📱 Mobile: {mobileNumber}
                  </a>
                )}
                {emergencyContact1 && (
                  <a href={`tel:${emergencyContact1}`} className="block text-xs text-primary hover:underline">
                    ☎️ Emergency 1: {emergencyContact1}
                  </a>
                )}
                {emergencyContact2 && (
                  <a href={`tel:${emergencyContact2}`} className="block text-xs text-primary hover:underline">
                    ☎️ Emergency 2: {emergencyContact2}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Call Status */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Call Status *</label>
            <Select value={callStatus} onValueChange={setCallStatus}>
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {CALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className={s === "Called" ? "text-success font-medium" : ""}>{s}{s === "Called" ? " ✅" : ""}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Absence Reason */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Absence Reason *</label>
            <Select value={absenceReason} onValueChange={setAbsenceReason}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {ABSENCE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Comment */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Comment</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Notes from the call..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Expected Return Date */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Expected Return Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !expectedReturn && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expectedReturn ? format(expectedReturn, "dd MMM yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={expectedReturn}
                  onSelect={setExpectedReturn}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Call Log"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CallLogDialog;
