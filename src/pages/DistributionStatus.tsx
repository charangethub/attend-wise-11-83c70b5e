import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Search, Package, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageDataset } from "@/hooks/usePageDataset";
import { fetchDatasetStudents } from "@/lib/attendanceData";
import CsvUploadDialog from "@/components/CsvUploadDialog";
import { buildStudentLookup, findStudentInRow } from "@/lib/csvMatch";

const ITEM_TYPES = [
  "BAG", "CLICKER", "DIARY", "FACE_ID_REG", "HOLDER_ID_CARD", "HW_PLANNER",
  "ID_CARD", "IPE_BOOK", "LYANARD", "T_SHIRT", "TATVA", "VDPP"
] as const;

const ITEM_LABELS: Record<string, string> = {
  BAG: "BAG", CLICKER: "CLICKER", DIARY: "DIARY",
  FACE_ID_REG: "FACE ID REG", HOLDER_ID_CARD: "HOLDER- ID CARD", HW_PLANNER: "HW PLANNER",
  ID_CARD: "ID CARD", IPE_BOOK: "IPE BOOK", LYANARD: "LYANARD",
  T_SHIRT: "T-SHIRT", TATVA: "TATVA", VDPP: "VDPP"
};

// Items where multiple units are commonly given to a single student
const MULTI_QTY_ITEMS = new Set(["T_SHIRT"]);
const DEFAULT_MULTI_QTY = 2;

type Student = { id: string; roll_no: string; student_name: string; classroom_name: string; center: string; user_id_vedantu: string };
type DistStatus = { student_id: string; item_type: string; status: string; given_date: string | null; quantity?: number };
type InventoryRow = { item_name: string; current_stock: number; distributed: number; damaged: number; missing: number; reserved: number };

const normaliseItem = (s: string) => s.trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/g, "");

const DistributionStatus = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { datasetSlug } = usePageDataset("Distribution Status");
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";
  const isOwner = userRole === "owner";

  const [students, setStudents] = useState<Student[]>([]);
  const [distMap, setDistMap] = useState<Record<string, Record<string, DistStatus>>>({});
  const [inventoryByItem, setInventoryByItem] = useState<Record<string, InventoryRow>>({});
  const [loading, setLoading] = useState(true);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [statusFilterType, setStatusFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    if (!datasetSlug) return;
    setLoading(true);
    try {
      const stuRows = await fetchDatasetStudents<Student>(datasetSlug, "id, roll_no, student_name, classroom_name, center, user_id_vedantu");
      setStudents(stuRows);

      const ids = stuRows.map(s => s.id);
      const map: Record<string, Record<string, DistStatus>> = {};

      if (ids.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        await Promise.all(chunks.map(async chunk => {
          const { data } = await supabase
            .from("distribution_status" as any)
            .select("student_id, item_type, status, given_date, quantity")
            .in("student_id", chunk);
          (data as any[])?.forEach((r: any) => {
            if (!map[r.student_id]) map[r.student_id] = {};
            map[r.student_id][r.item_type] = r;
          });
        }));
      }
      setDistMap(map);

      // Pull inventory rows so we can show real available stock per item type
      const { data: inv } = await supabase
        .from("inventory_items")
        .select("item_name, current_stock, distributed, damaged, missing, reserved");
      const invMap: Record<string, InventoryRow> = {};
      (inv as any[])?.forEach((row: any) => {
        const key = normaliseItem(row.item_name || "");
        if (!key) return;
        // Aggregate if multiple inventory rows share same normalised name
        if (!invMap[key]) invMap[key] = { item_name: row.item_name, current_stock: 0, distributed: 0, damaged: 0, missing: 0, reserved: 0 };
        invMap[key].current_stock += row.current_stock ?? 0;
        invMap[key].distributed += row.distributed ?? 0;
        invMap[key].damaged += row.damaged ?? 0;
        invMap[key].missing += row.missing ?? 0;
        invMap[key].reserved += row.reserved ?? 0;
      });
      setInventoryByItem(invMap);
    } finally {
      setLoading(false);
    }
  }, [datasetSlug]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const classrooms = useMemo(
    () => Array.from(new Set(students.map(s => s.classroom_name).filter(Boolean))).sort(),
    [students]
  );

  const filtered = useMemo(() => {
    return students.filter(s => {
      if (classroomFilter !== "all" && s.classroom_name !== classroomFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (!s.student_name.toLowerCase().includes(q) && !s.roll_no.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.roll_no.localeCompare(b.roll_no));
  }, [students, classroomFilter, debouncedSearch]);

  // For each item type: how many UNITS distributed (sum of quantity over GIVEN rows)
  const summaries = useMemo(() => {
    const counts: Record<string, { given: number; available: number }> = {};
    ITEM_TYPES.forEach(t => {
      const inv = inventoryByItem[t];
      const available = inv
        ? Math.max(0, (inv.current_stock ?? 0) - (inv.damaged ?? 0) - (inv.missing ?? 0) - (inv.reserved ?? 0))
        : 0;
      counts[t] = { given: 0, available };
    });
    Object.values(distMap).forEach(items => {
      ITEM_TYPES.forEach(t => {
        if (items[t]?.status === "GIVEN") {
          counts[t].given += items[t]?.quantity ?? 1;
        }
      });
    });
    return counts;
  }, [distMap, inventoryByItem]);

  const getQtyForItem = (itemType: string) =>
    MULTI_QTY_ITEMS.has(itemType) ? DEFAULT_MULTI_QTY : 1;

  const toggleStatus = async (studentId: string, itemType: string) => {
    if (!isAdminOrOwner) return;
    const current = distMap[studentId]?.[itemType]?.status;
    const newStatus = current === "GIVEN" ? "PENDING" : "GIVEN";
    const qty = getQtyForItem(itemType);

    try {
      const { error } = await supabase.from("distribution_status" as any).upsert({
        student_id: studentId,
        item_type: itemType,
        status: newStatus,
        quantity: newStatus === "GIVEN" ? qty : 1,
        given_date: newStatus === "GIVEN" ? format(new Date(), "yyyy-MM-dd") : null,
        given_by: newStatus === "GIVEN" ? user?.id : null,
        dataset: datasetSlug,
      } as any, { onConflict: "student_id,item_type" });
      if (error) throw error;

      setDistMap(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [itemType]: {
            student_id: studentId, item_type: itemType, status: newStatus,
            quantity: newStatus === "GIVEN" ? qty : 1,
            given_date: newStatus === "GIVEN" ? format(new Date(), "yyyy-MM-dd") : null,
          },
        },
      }));
      // Re-pull inventory to reflect trigger-driven decrement
      void fetchData();
    } catch {
      toast.error("Failed to update");
    }
  };

  const downloadTemplate = () => {
    const header = ["user_id_vedantu", "roll_no", ...ITEM_TYPES.map(t => t)].join(",");
    const sampleRow = ["VED-001", "ROLL001", ...ITEM_TYPES.map(t => MULTI_QTY_ITEMS.has(t) ? "GIVEN:2" : "GIVEN")].join(",");
    const csv = `${header}\n${sampleRow}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "distribution_status_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = async (file: File) => {
    setCsvUploading(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error("CSV must have header + data rows"); setCsvUploading(false); return; }

      const headers = lines[0].split(",").map(h => h.trim());
      const lookup = buildStudentLookup(students as any);
      const upserts: any[] = [];
      let skipped = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim());
        const matched = findStudentInRow(cols, headers, lookup);
        if (!matched) { skipped++; continue; }

        headers.forEach((h, idx) => {
          const itemType = normaliseItem(h);
          if (!ITEM_TYPES.includes(itemType as any)) return;
          const raw = (cols[idx] || "").toUpperCase();
          if (!raw) return;
          // Accept "GIVEN", "GIVEN:2", "GIVEN(2)", "PENDING"
          const m = raw.match(/^(GIVEN|PENDING)(?:[:\s(]+(\d+)\)?)?$/);
          if (!m) return;
          const status = m[1];
          const qty = m[2] ? parseInt(m[2], 10) : getQtyForItem(itemType);
          upserts.push({
            student_id: matched.id,
            item_type: itemType,
            status,
            quantity: status === "GIVEN" ? qty : 1,
            given_date: status === "GIVEN" ? format(new Date(), "yyyy-MM-dd") : null,
            given_by: status === "GIVEN" ? user?.id : null,
            dataset: datasetSlug,
          });
        });
      }

      if (upserts.length === 0) { toast.error("No valid rows found"); setCsvUploading(false); return; }

      for (let i = 0; i < upserts.length; i += 50) {
        await supabase.from("distribution_status" as any).upsert(upserts.slice(i, i + 50), { onConflict: "student_id,item_type" });
      }

      toast.success(`Uploaded ${upserts.length} records (${skipped} skipped)`);
      setCsvUploadOpen(false);
      fetchData();
    } catch (err: any) { toast.error("Upload failed: " + err.message); }
    setCsvUploading(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-foreground">Distribution Status</h2>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isOwner && (
            <Button variant="outline" onClick={() => setCsvUploadOpen(true)} className="gap-1.5">
              <Upload className="h-4 w-4" /> Upload CSV
            </Button>
          )}
          <Button variant="outline" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh Data</Button>
        </div>
      </div>

      {/* Summary Cards — Given / Available stock */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase">TOTAL STUDENTS</p>
          <p className="text-2xl font-bold text-foreground">{students.length}</p>
        </div>
        {ITEM_TYPES.map(t => {
          const s = summaries[t] ?? { given: 0, available: 0 };
          const remaining = s.available;
          return (
            <div key={t} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase">{ITEM_LABELS[t]}</p>
              <p className="text-lg font-bold">
                <span className={s.given > 0 ? "text-success" : "text-muted-foreground"}>{s.given}</span>
                <span className="text-muted-foreground text-sm"> given</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Stock left: <span className={remaining > 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>{remaining}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <Button variant={statusFilterType === "all" ? "default" : "outline"} size="sm" onClick={() => setStatusFilterType("all")}>
            All
          </Button>
          <Button variant={statusFilterType === "given" ? "default" : "outline"} size="sm" onClick={() => setStatusFilterType("given")}
            className={statusFilterType === "given" ? "bg-success text-success-foreground hover:bg-success/90" : ""}>Given</Button>
          <Button variant={statusFilterType === "pending" ? "default" : "outline"} size="sm" onClick={() => setStatusFilterType("pending")}
            className={statusFilterType === "pending" ? "bg-destructive text-destructive-foreground" : ""}>Pending</Button>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or roll no..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={classroomFilter} onValueChange={setClassroomFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classrooms</SelectItem>
            {classrooms.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50 sticky top-0 z-10">
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap"></th>
              {ITEM_TYPES.map(t => (
                <th key={t} className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">{ITEM_LABELS[t]}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-medium">{s.student_name}</span>
                    <span className="text-xs text-muted-foreground ml-1">({s.roll_no})</span>
                  </td>
                  {ITEM_TYPES.map(t => {
                    const row = distMap[s.id]?.[t];
                    const status = row?.status || "PENDING";
                    const qty = row?.quantity ?? 1;
                    if (statusFilterType === "given" && status !== "GIVEN") return <td key={t} className="px-3 py-2.5 text-center text-muted-foreground">—</td>;
                    if (statusFilterType === "pending" && status !== "PENDING") return <td key={t} className="px-3 py-2.5 text-center text-muted-foreground">—</td>;
                    const showQty = status === "GIVEN" && (MULTI_QTY_ITEMS.has(t) || qty > 1);
                    return (
                      <td key={t} className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => toggleStatus(s.id, t)}
                          disabled={!isAdminOrOwner}
                          className={`rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
                            status === "GIVEN"
                              ? "bg-success text-success-foreground"
                              : "bg-destructive text-destructive-foreground"
                          } ${!isAdminOrOwner ? "cursor-default" : "hover:opacity-80"}`}
                        >
                          {status}{showQty ? ` (${qty})` : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CsvUploadDialog
        open={csvUploadOpen}
        onOpenChange={setCsvUploadOpen}
        title="Upload Distribution CSV"
        description="Bulk update distribution status for many students."
        onDownloadTemplate={downloadTemplate}
        onUpload={handleCsvUpload}
        uploading={csvUploading}
        helpText={
          <>
            <p><strong>Columns:</strong> user_id_vedantu (preferred) or roll_no, then item types (BAG, CLICKER, T_SHIRT, …)</p>
            <p><strong>Values:</strong> <code>GIVEN</code>, <code>PENDING</code>, or <code>GIVEN:2</code> for multi-quantity (e.g. 2 T-shirts).</p>
            <p>Students are matched by user_id_vedantu first, then roll_no.</p>
          </>
        }
      />
    </div>
  );
};

export default DistributionStatus;
