import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Search, Package, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageDataset } from "@/hooks/usePageDataset";
import { fetchDatasetStudents } from "@/lib/attendanceData";
import CsvUploadDialog from "@/components/CsvUploadDialog";
import { buildStudentLookup, findStudentInRow } from "@/lib/csvMatch";
import { parseCsv, normalizeHeader } from "@/lib/csvParse";

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

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const SIZED_ITEMS = new Set(["T_SHIRT"]);

type Student = { id: string; roll_no: string; student_name: string; classroom_name: string; center: string; user_id_vedantu: string };
type DistStatus = { student_id: string; item_type: string; status: string; given_date: string | null; quantity?: number; size?: string | null };
type InventoryRow = { item_name: string; size?: string | null; ytd_received: number; current_stock: number; distributed: number; damaged: number; missing: number; reserved: number };

/** Normalise raw label into a canonical item key. Preserves T-shirt size when present. */
const canonicalItem = (s: string) => {
  const k = (s || "").trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/g, "");
  if (k.startsWith("VDPP")) return "VDPP";
  if (k.startsWith("T_SHIRT") || k === "TSHIRT" || k.startsWith("TSHIRT")) {
    const sz = k.replace(/^T_?SHIRT_?/, "");
    if (TSHIRT_SIZES.includes(sz as any)) return `T_SHIRT_${sz}`;
    return "T_SHIRT";
  }
  return k;
};
/** Base canonical without size suffix (used for grouping by item type column) */
const baseCanonical = (s: string) => {
  const c = canonicalItem(s);
  return c.startsWith("T_SHIRT_") ? "T_SHIRT" : c;
};
/** Inventory normalisation: collapses sized rows back to base item for whole-bucket aggregation */
const normaliseItem = baseCanonical;

const DistributionStatus = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { datasetSlug } = usePageDataset("Distribution Status");
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";
  const isOwner = userRole === "owner";

  const [students, setStudents] = useState<Student[]>([]);
  const [distMap, setDistMap] = useState<Record<string, Record<string, DistStatus>>>({});
  const [inventoryByItem, setInventoryByItem] = useState<Record<string, InventoryRow>>({});
  // Per-size inventory for T-shirts (key = size, e.g. "M")
  const [tshirtBySize, setTshirtBySize] = useState<Record<string, InventoryRow>>({});
  const [loading, setLoading] = useState(true);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [statusFilterType, setStatusFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [openSizePicker, setOpenSizePicker] = useState<string | null>(null); // key = `${studentId}:${itemType}`

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
            .select("student_id, item_type, status, given_date, quantity, size")
            .in("student_id", chunk);
          (data as any[])?.forEach((r: any) => {
            // Group rows under base item type (so T_SHIRT_L, T_SHIRT_M live in same column)
            const base = baseCanonical(r.item_type);
            if (!map[r.student_id]) map[r.student_id] = {};
            const existing = map[r.student_id][base];
            const incoming: DistStatus = { ...r, item_type: base, size: r.size ?? null };
            if (existing && existing.status === "GIVEN" && r.status === "GIVEN") {
              existing.quantity = (existing.quantity ?? 1) + (r.quantity ?? 1);
              if (!existing.size && incoming.size) existing.size = incoming.size;
            } else if (!existing || r.status === "GIVEN") {
              map[r.student_id][base] = incoming;
            }
          });
        }));
      }
      setDistMap(map);

      // Inventory rows
      const { data: inv } = await supabase
        .from("inventory_items")
        .select("item_name, size, ytd_received, current_stock, distributed, damaged, missing, reserved");
      const invMap: Record<string, InventoryRow> = {};
      const tshirtMap: Record<string, InventoryRow> = {};
      (inv as any[])?.forEach((row: any) => {
        const key = normaliseItem(row.item_name || "");
        if (!key) return;
        if (!invMap[key]) invMap[key] = { item_name: row.item_name, ytd_received: 0, current_stock: 0, distributed: 0, damaged: 0, missing: 0, reserved: 0 };
        invMap[key].ytd_received += row.ytd_received ?? 0;
        invMap[key].current_stock += row.current_stock ?? 0;
        invMap[key].distributed += row.distributed ?? 0;
        invMap[key].damaged += row.damaged ?? 0;
        invMap[key].missing += row.missing ?? 0;
        invMap[key].reserved += row.reserved ?? 0;

        if (key === "T_SHIRT") {
          const sz = (row.size || "").trim().toUpperCase();
          if (sz && TSHIRT_SIZES.includes(sz as any)) {
            if (!tshirtMap[sz]) tshirtMap[sz] = { item_name: row.item_name, size: sz, ytd_received: 0, current_stock: 0, distributed: 0, damaged: 0, missing: 0, reserved: 0 };
            tshirtMap[sz].ytd_received += row.ytd_received ?? 0;
            tshirtMap[sz].current_stock += row.current_stock ?? 0;
            tshirtMap[sz].distributed += row.distributed ?? 0;
            tshirtMap[sz].damaged += row.damaged ?? 0;
            tshirtMap[sz].missing += row.missing ?? 0;
            tshirtMap[sz].reserved += row.reserved ?? 0;
          }
        }
      });
      setInventoryByItem(invMap);
      setTshirtBySize(tshirtMap);
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
    const counts: Record<string, { given: number; ytd: number; available: number }> = {};
    ITEM_TYPES.forEach(t => {
      const inv = inventoryByItem[t];
      const ytd = inv?.ytd_received ?? 0;
      counts[t] = { given: 0, ytd, available: inv?.current_stock ?? 0 };
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

  // Per-size given counts for T-shirts
  const tshirtGivenBySize = useMemo(() => {
    const counts: Record<string, number> = {};
    TSHIRT_SIZES.forEach(s => { counts[s] = 0; });
    Object.values(distMap).forEach(items => {
      const row = items["T_SHIRT"];
      if (row?.status === "GIVEN" && row.size) {
        const sz = row.size.toUpperCase();
        if (TSHIRT_SIZES.includes(sz as any)) {
          counts[sz] += row.quantity ?? 1;
        }
      }
    });
    return counts;
  }, [distMap]);

  const getQtyForItem = (itemType: string) =>
    MULTI_QTY_ITEMS.has(itemType) ? DEFAULT_MULTI_QTY : 1;

  /**
   * Toggle / set a status. For T-shirts, `size` is required when going to GIVEN.
   */
  const setItemStatus = async (
    studentId: string,
    itemType: string,
    desired: "GIVEN" | "PENDING",
    size?: string,
  ) => {
    if (!isAdminOrOwner) return;
    const qty = getQtyForItem(itemType);
    const isSized = SIZED_ITEMS.has(itemType);
    const prev = distMap[studentId]?.[itemType];
    // For sized items, the actual stored item_type encodes size (e.g. T_SHIRT_L) so the trigger picks the right inventory row
    const storedItemType = isSized && desired === "GIVEN" && size
      ? `${itemType}_${size}`
      : (isSized && prev?.size ? `${itemType}_${prev.size}` : itemType);

    try {
      if (desired === "GIVEN") {
        const { error } = await supabase.from("distribution_status" as any).upsert({
          student_id: studentId,
          item_type: storedItemType,
          status: "GIVEN",
          quantity: qty,
          size: isSized ? (size || prev?.size || "") : "",
          given_date: format(new Date(), "yyyy-MM-dd"),
          given_by: user?.id,
          dataset: datasetSlug,
        } as any, { onConflict: "student_id,item_type,size" });
        if (error) throw error;
      } else {
        // Setting back to PENDING — update existing row if any
        const { error } = await supabase.from("distribution_status" as any).upsert({
          student_id: studentId,
          item_type: storedItemType,
          status: "PENDING",
          quantity: 1,
          size: isSized ? (prev?.size || "") : "",
          given_date: null,
          given_by: null,
          dataset: datasetSlug,
        } as any, { onConflict: "student_id,item_type,size" });
        if (error) throw error;
      }

      setDistMap(p => ({
        ...p,
        [studentId]: {
          ...p[studentId],
          [itemType]: {
            student_id: studentId,
            item_type: itemType,
            status: desired,
            quantity: desired === "GIVEN" ? qty : 1,
            size: isSized ? (size || prev?.size || null) : null,
            given_date: desired === "GIVEN" ? format(new Date(), "yyyy-MM-dd") : null,
          },
        },
      }));
      void fetchData();
    } catch (err: any) {
      console.error("Distribution update failed:", err);
      toast.error(`Failed to update: ${err?.message || err?.code || "unknown error"}`);
    }
  };

  const handleCellClick = (studentId: string, itemType: string) => {
    if (!isAdminOrOwner) return;
    const current = distMap[studentId]?.[itemType];
    const isSized = SIZED_ITEMS.has(itemType);
    if (isSized) {
      if (current?.status === "GIVEN") {
        // Toggle back to PENDING
        void setItemStatus(studentId, itemType, "PENDING");
      } else {
        // Open size picker
        setOpenSizePicker(`${studentId}:${itemType}`);
      }
    } else {
      void setItemStatus(studentId, itemType, current?.status === "GIVEN" ? "PENDING" : "GIVEN");
    }
  };

  const downloadTemplate = () => {
    const header = ["user_id_vedantu", "roll_no", ...ITEM_TYPES.map(t => t)].join(",");
    const sampleRow = ["VED-001", "ROLL001", ...ITEM_TYPES.map(t => {
      if (t === "T_SHIRT") return "GIVEN:2:M";
      return MULTI_QTY_ITEMS.has(t) ? "GIVEN:2" : "GIVEN";
    })].join(",");
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
      const rows = parseCsv(text);
      if (rows.length < 2) { toast.error("CSV must have header + data rows"); setCsvUploading(false); return; }

      const headers = rows[0].map((h) => normalizeHeader(h));
      const lookup = buildStudentLookup(students as any);
      const upserts: any[] = [];
      const skippedReasons: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].map((c) => (c ?? "").trim());
        const matched = findStudentInRow(cols, headers, lookup);
        if (!matched) { skippedReasons.push(`Row ${i + 1}: no student match`); continue; }

        headers.forEach((h, idx) => {
          const baseItem = baseCanonical(h);
          if (!ITEM_TYPES.includes(baseItem as any)) return;
          const raw = (cols[idx] || "").toUpperCase();
          if (!raw) return;
          // Accept "GIVEN", "GIVEN:2", "GIVEN:2:M", "GIVEN(2)", "PENDING"
          const m = raw.match(/^(GIVEN|PENDING)(?:[:\s(]+(\d+)\)?)?(?::([A-Z]+))?$/);
          if (!m) return;
          const status = m[1];
          const qty = m[2] ? parseInt(m[2], 10) : getQtyForItem(baseItem);
          const size = m[3] && TSHIRT_SIZES.includes(m[3] as any) ? m[3] : undefined;
          const isSized = SIZED_ITEMS.has(baseItem);
          const storedItemType = isSized && size ? `${baseItem}_${size}` : baseItem;

          upserts.push({
            student_id: matched.id,
            item_type: storedItemType,
            status,
            quantity: status === "GIVEN" ? qty : 1,
            size: isSized && size ? size : "",
            given_date: status === "GIVEN" ? format(new Date(), "yyyy-MM-dd") : null,
            given_by: status === "GIVEN" ? user?.id : null,
            dataset: datasetSlug,
          });
        });
      }

      if (upserts.length === 0) {
        console.warn("Distribution CSV: no valid rows.", skippedReasons);
        toast.error(`No valid rows found. ${skippedReasons.slice(0, 3).join(" • ")}`);
        setCsvUploading(false); return;
      }

      for (let i = 0; i < upserts.length; i += 50) {
        await supabase.from("distribution_status" as any).upsert(upserts.slice(i, i + 50), { onConflict: "student_id,item_type,size" });
      }

      toast.success(`Uploaded ${upserts.length} records (${skippedReasons.length} skipped)`);
      setCsvUploadOpen(false);
      fetchData();
    } catch (err: any) { toast.error("Upload failed: " + err.message); }
    setCsvUploading(false);
  };

  return (
    <div className="w-full px-4 py-6 max-w-none">
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

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase">TOTAL STUDENTS</p>
          <p className="text-2xl font-bold text-foreground">{students.length}</p>
        </div>
        {ITEM_TYPES.map(t => {
          const ytd = summaries[t]?.ytd ?? 0;
          const given = summaries[t]?.given ?? 0;
          const available = summaries[t]?.available ?? 0;
          return (
            <div key={t} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase">{ITEM_LABELS[t]}</p>
              <p className="text-lg font-bold leading-tight">
                <span className={given > 0 ? "text-success" : "text-muted-foreground"}>{given}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="text-foreground">{ytd}</span>
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">given / ytd</p>
              <p className="mt-1 text-[11px]">
                <span className="text-muted-foreground">Available: </span>
                <span className={available > 0 ? "text-success font-bold" : "text-destructive font-bold"}>{available}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* T-Shirt size breakdown */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">T-Shirt Sizes — Given / YTD</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {TSHIRT_SIZES.map(sz => {
            const inv = tshirtBySize[sz];
            const ytd = inv?.ytd_received ?? 0;
            const given = tshirtGivenBySize[sz] ?? 0;
            const available = inv?.current_stock ?? 0;
            return (
              <div key={sz} className="rounded-lg border border-border bg-muted/30 p-2 text-center">
                <p className="text-[11px] font-bold uppercase text-muted-foreground">{sz}</p>
                <p className="text-sm font-bold leading-tight">
                  <span className={given > 0 ? "text-success" : "text-muted-foreground"}>{given}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-foreground">{ytd}</span>
                </p>
                <p className="text-[10px]">
                  <span className="text-muted-foreground">avail </span>
                  <span className={available > 0 ? "text-success font-bold" : "text-destructive font-bold"}>{available}</span>
                </p>
              </div>
            );
          })}
        </div>
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
                    const size = row?.size ?? null;
                    if (statusFilterType === "given" && status !== "GIVEN") return <td key={t} className="px-3 py-2.5 text-center text-muted-foreground">—</td>;
                    if (statusFilterType === "pending" && status !== "PENDING") return <td key={t} className="px-3 py-2.5 text-center text-muted-foreground">—</td>;
                    const showQty = status === "GIVEN" && (MULTI_QTY_ITEMS.has(t) || qty > 1);
                    const isSized = SIZED_ITEMS.has(t);
                    const pickerKey = `${s.id}:${t}`;
                    const isPickerOpen = openSizePicker === pickerKey;
                    const labelText = `${status}${showQty ? ` (${qty})` : ""}${isSized && status === "GIVEN" && size ? ` · ${size}` : ""}`;

                    const pill = (
                      <button
                        onClick={() => handleCellClick(s.id, t)}
                        disabled={!isAdminOrOwner}
                        className={`rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
                          status === "GIVEN"
                            ? "bg-success text-success-foreground"
                            : "bg-destructive text-destructive-foreground"
                        } ${!isAdminOrOwner ? "cursor-default" : "hover:opacity-80"}`}
                      >
                        {labelText}
                      </button>
                    );

                    return (
                      <td key={t} className="px-3 py-2.5 text-center">
                        {isSized ? (
                          <Popover open={isPickerOpen} onOpenChange={(o) => setOpenSizePicker(o ? pickerKey : null)}>
                            <PopoverTrigger asChild>{pill}</PopoverTrigger>
                            <PopoverContent className="w-auto p-2" align="center">
                              <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">Select T-shirt size</p>
                              <div className="grid grid-cols-3 gap-1">
                                {TSHIRT_SIZES.map(sz => {
                                  const ytd = tshirtBySize[sz]?.ytd_received ?? 0;
                                  const givenSz = tshirtGivenBySize[sz] ?? 0;
                                  const availSz = Math.max(0, ytd - givenSz);
                                  return (
                                    <Button
                                      key={sz}
                                      size="sm"
                                      variant={size === sz ? "default" : "outline"}
                                      disabled={availSz <= 0}
                                      onClick={() => {
                                        setOpenSizePicker(null);
                                        void setItemStatus(s.id, t, "GIVEN", sz);
                                      }}
                                      className="h-8 text-xs"
                                    >
                                      {sz}
                                      <span className="ml-1 text-[9px] text-muted-foreground">({availSz})</span>
                                    </Button>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : pill}
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
            <p><strong>Values:</strong> <code>GIVEN</code>, <code>PENDING</code>, <code>GIVEN:2</code> for multi-qty, or <code>GIVEN:2:M</code> for T-shirts (size XS/S/M/L/XL/XXL).</p>
            <p>Students are matched by user_id_vedantu first, then roll_no.</p>
          </>
        }
      />
    </div>
  );
};

export default DistributionStatus;
