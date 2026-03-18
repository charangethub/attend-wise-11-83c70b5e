import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, User, CalendarDays, BookOpen } from "lucide-react";

interface RemarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  rollNo: string;
  grade?: string;
  classroom?: string;
  date: string;
  session?: string;
  currentRemark: string;
  onSave: (remark: string) => void;
}

const RemarkDialog = ({
  open,
  onOpenChange,
  studentName,
  rollNo,
  grade,
  classroom,
  date,
  session,
  currentRemark,
  onSave,
}: RemarkDialogProps) => {
  const [remark, setRemark] = useState(currentRemark);

  useEffect(() => {
    setRemark(currentRemark);
  }, [currentRemark, open]);

  const handleSave = () => {
    onSave(remark);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Edit Remark
          </DialogTitle>
          <DialogDescription>Add or update the remark for this student.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Student Details */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Student:</span>
              <span className="text-sm font-semibold text-foreground">{studentName}</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{rollNo}</span>
            </div>
            {(grade || classroom) && (
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {[grade, classroom].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {date}{session ? ` · ${session} Session` : ""}
              </span>
            </div>
          </div>

          {/* Remark Input */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Remark / Reason</label>
            <Textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Enter reason for leave or absence..."
              rows={3}
              className="text-sm"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="h-4 w-4" /> Save Remark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RemarkDialog;
