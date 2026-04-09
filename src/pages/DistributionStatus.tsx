import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Search, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveDataset } from "@/hooks/useActiveDataset";
import { fetchDatasetStudents } from "@/lib/attendanceData";

const ITEM_TYPES = ["BAG", "CLICKER", "DIARY", "FACE_ID_REG", "HOLDER_ID_CARD", "HW_PLANNER"] as const;
const ITEM_LABELS: Record<string, string> = {
  BAG: "BAG", CLICKER: "CLICKER", DIARY: "DIARY",
  FACE_ID_REG: "FACE ID REG", HOLDER_ID_CARD: "HOLDER- ID CARD", HW_PLANNER: "HW PLANNER"
};

type Student = { id: string; roll_no: string; student_name: string; classroom_name: string; center: string; user_id_vedantu: string };
type DistStatus = { student_id: string; item_type: string; status: string; given_date: string | null };

const DistributionStatus = () => {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { activeSlug } = useActiveDataset();
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";
  const isOwner = userRole === "owner";

  const [students, setStudents] = useState<Student[]>([]);
  const [distMap, setDistMap] = useState<Record<string, Record<string, DistStatus>>>({});
  const [loading, setLoading] = useState(true);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [statusFilterType, setStatusFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    if (!activeSlug) return;
    setLoading(true);
    try {
      const stuRows = await fetchDatasetStudents<Student>(activeSlug, "id, roll_no, student_name, classroom_name, center, user_id_vedantu");
      setStudents(stuRows);

      const ids = stuRows.map(s => s.id);
      const map: Record<string, Record<string, DistStatus>> = {};

      if (ids.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        await Promise.all(chunks.map(async chunk => {
          const { data } = await supabase
            .from("distribution_status" as any)
            .select("student_id, item_type, status, given_date")
            .in("student_id", chunk);
          (data as any[])?.forEach((r: any) => {
            if (!map[r.student_id]) map[r.student_id] = {};
            map[r.student_id][r.item_type] = r;
          });
        }));
      }
      setDistMap(map);
    } finally {
      setLoading(false);
    }
  }, [activeSlug]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const classrooms = useMemo(() => Array.from(new Set(students.map(s => s.classroom_name).filter(Boolean))).sort(), [students]);

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

  // Summary counts
  const summaries = useMemo(() => {
    const counts: Record<string, { given: number; total: number }> = {};
    ITEM_TYPES.forEach(t => { counts[t] = { given: 0, total: students.length }; });
    Object.values(distMap).forEach(items => {
      ITEM_TYPES.forEach(t => {
        if (items[t]?.status === "GIVEN") counts[t].given++;
      });
    });
    return counts;
  }, [students, distMap]);

  const toggleStatus = async (studentId: string, itemType: string) => {
    if (!isAdminOrOwner) return;
    const current = distMap[studentId]?.[itemType]?.status;
    const newStatus = current === "GIVEN" ? "PENDING" : "GIVEN";

    try {
      const { error } = await supabase.from("distribution_status" as any).upsert({
        student_id: studentId,
        item_type: itemType,
        status: newStatus,
        given_date: newStatus === "GIVEN" ? format(new Date(), "yyyy-MM-dd") : null,
        given_by: newStatus === "GIVEN" ? user?.id : null,
        dataset: activeSlug,
      } as any, { onConflict: "student_id,item_type" });
      if (error) throw error;

      setDistMap(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [itemType]: {
            student_id: studentId, item_type: itemType, status: newStatus,
            given_date: newStatus === "GIVEN" ? format(new Date(), "yyyy-MM-dd") : null,
          },
        },
      }));
    } catch {
      toast.error("Failed to update");
    }
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
        <Button variant="outline" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh Data</Button>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-semibold uppercase">TOTAL STUDENTS</p>
          <p className="text-2xl font-bold text-foreground">{students.length}</p>
        </div>
        {ITEM_TYPES.map(t => (
          <div key={t} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase">{ITEM_LABELS[t]}</p>
            <p className="text-lg font-bold">
              <span className={summaries[t]?.given > 0 ? "text-success" : "text-destructive"}>{summaries[t]?.given ?? 0}</span>
              <span className="text-muted-foreground text-sm"> / {summaries[t]?.total ?? 0}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <Button variant={statusFilterType === "all" ? "default" : "outline"} size="sm" onClick={() => setStatusFilterType("all")}
            className={statusFilterType === "all" ? "bg-success text-success-foreground" : ""}>Given</Button>
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
            <thead><tr className="bg-muted/50">
              <th className="px-3 py-2.5 text-left font-semibold">CENTER NAME</th>
              {isOwner && <th className="px-3 py-2.5 text-left font-semibold">USER ID</th>}
              <th className="px-3 py-2.5 text-left font-semibold">ROLL NO</th>
              <th className="px-3 py-2.5 text-left font-semibold">NAME OF THE STUDENT</th>
              <th className="px-3 py-2.5 text-left font-semibold">CLASSROOM NAME</th>
              {ITEM_TYPES.map(t => (
                <th key={t} className="px-3 py-2.5 text-center font-semibold">{ITEM_LABELS[t]}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2.5">{s.center || "—"}</td>
                  {isOwner && <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{s.user_id_vedantu || "—"}</td>}
                  <td className="px-3 py-2.5 font-medium">{s.roll_no}</td>
                  <td className="px-3 py-2.5">{s.student_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.classroom_name}</td>
                  {ITEM_TYPES.map(t => {
                    const status = distMap[s.id]?.[t]?.status || "PENDING";
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
                          {status}
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
    </div>
  );
};

export default DistributionStatus;
