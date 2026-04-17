import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Upload, FileSpreadsheet } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  templateLabel?: string;
  onDownloadTemplate: () => void;
  onUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  helpText?: React.ReactNode;
}

/**
 * Two-step CSV upload dialog with explicit "Upload" button (does NOT auto-process).
 */
const CsvUploadDialog = ({
  open,
  onOpenChange,
  title,
  description,
  templateLabel = "Download CSV Template",
  onDownloadTemplate,
  onUpload,
  uploading = false,
  helpText,
}: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = (o: boolean) => {
    onOpenChange(o);
    if (!o) reset();
  };

  const handleSubmit = async () => {
    if (!file) return;
    await onUpload(file);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Button variant="outline" onClick={onDownloadTemplate} className="gap-1.5 w-full">
            <Download className="h-4 w-4" /> {templateLabel}
          </Button>
          {helpText && <div className="text-xs text-muted-foreground space-y-1">{helpText}</div>}
          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">Choose CSV file</label>
            <Input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
            />
            {file && (
              <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" /> {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!file || uploading} className="gap-1.5">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CsvUploadDialog;
