import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Download, MessageCircle, Save, CalendarDays, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveDataset } from "@/hooks/useActiveDataset";

const AbsenteeDashboard = () => {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { activeSlug } = useActiveDataset();
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classroomFilter, setClassroomFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => { if (!activeSlug) return; setLoading(true); const [stuRes, attRes] = await Promise.all([supabase.from("students").select("id, roll_no, student_name, grade, classroom_name, emergency_contact_1, emergency_contact_2, enrollment_status").neq("roll_no", "").eq("enrollment_status", "ENROLLED").eq("dataset", activeSlug), supabase.from("attendance").select("id, student_id, status, remark").eq("date", selectedDate).in("status", ["AB", "L"])]); setStudents(stuRes.data ?? []); setAttendance(attRes.data ?? []); const rMap: Record<string, string> = {}; (attRes.data ?? []).forEach((a: any) => { rMap[a.student_id] = a.remark || ""; }); setRemarks(rMap); setLoading(false); };
    fetchData();
  }, [selectedDate, activeSlug]);

  const absentees = useMemo(() => { const attMap = new Map(attendance.map((a: any) => [a.student_id, a])); return students.filter((s) => attMap.has(s.id)).filter((s) => classroomFilter === "all" || s.classroom_name === classroomFilter).filter((s) => { if (!searchQuery) return true; const q = searchQuery.toLowerCase(); return s.student_name.toLowerCase().includes(q) || s.roll_no.toLowerCase().includes(q); }).map((s) => ({ ...s, att: attMap.get(s.id) })).sort((a, b) => a.roll_no.localeCompare(b.roll_no)); }, [students, attendance, classroomFilter, searchQuery]);
  const classrooms = useMemo(() => Array.from(new Set(students.map((s: any) => s.classroom_name).filter(Boolean))).sort(), [students]);
  const handleSaveRemarks = async () => { setSaving(true); try { for (const [studentId, remark] of Object.entries(remarks)) { await supabase.from("attendance").update({ remark }).eq("student_id", studentId).eq("date", selectedDate); } toast.success("Remarks saved!"); try { await supabase.functions.invoke("sync-to-sheet", { body: { date: selectedDate } }); } catch {} } catch { toast.error("Failed to save remarks"); } setSaving(false); };
  const maskNumber = (num: string) => { if (!num || num.length < 4) return "••••••••"; return "••••••" + num.slice(-4); };
  const makeWhatsAppUrl = (contactNum: string, studentName: string, rollNo: string, status: string) => { const cleanNum = contactNum.replace(/\D/g, ""); if (!cleanNum) return null; const msg = encodeURIComponent(`Dear Parent, your child ${studentName} (Roll: ${rollNo}) was marked ${status === "AB" ? "Absent" : "On Leave"} on ${selectedDate}. - Vedantu Learning Centre`); return `https://wa.me/91${cleanNum}?text=${msg}`; };
  const exportCSV = () => { const headers = isAdminOrOwner ? ["Roll No", "Student Name", "Grade", "Classroom", "Emergency Contact 1", "Emergency Contact 2", "Status", "Remark"] : ["Roll No", "Student Name", "Grade", "Classroom", "Status", "Remark"]; const rows = absentees.map((s) => { const base = [s.roll_no, s.student_name, s.grade, s.classroom_name]; if (isAdminOrOwner) base.push(s.emergency_contact_1 || "", s.emergency_contact_2 || ""); base.push(s.att.status, remarks[s.id] || ""); return base; }); const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${c}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `absentees-${selectedDate}.csv`; a.click(); URL.revokeObjectURL(url); };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button><div><h2 className="text-2xl font-bold text-foreground">Daily Absentee Report</h2><p className="text-sm text-muted-foreground">{absentees.length} absent/on leave</p></div></div>
        <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={handleSaveRemarks} disabled={saving} className="gap-1.5"><Save className="h-4 w-4" /> Save Remarks</Button><Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button></div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></div>
        <Select value={classroomFilter} onValueChange={setClassroomFilter}><SelectTrigger className="w-48"><SelectValue placeholder="All Classrooms" /></SelectTrigger><SelectContent><SelectItem value="all">All Classrooms</SelectItem>{classrooms.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
      </div>
      {loading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : absentees.length === 0 ? <p className="py-12 text-center text-muted-foreground">No absentees for this date 🎉</p> : (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm"><thead><tr className="bg-muted/50"><th className="px-4 py-2.5 text-left font-semibold">Roll No</th><th className="px-4 py-2.5 text-left font-semibold">Student Name</th><th className="px-4 py-2.5 text-left font-semibold">Grade</th><th className="px-4 py-2.5 text-left font-semibold">Classroom</th><th className="px-4 py-2.5 text-left font-semibold">Emergency Contact 1</th><th className="px-4 py-2.5 text-left font-semibold">Emergency Contact 2</th><th className="px-4 py-2.5 text-center font-semibold">Status</th><th className="px-4 py-2.5 text-left font-semibold">Remark</th><th className="px-4 py-2.5 text-center font-semibold">WhatsApp</th></tr></thead>
            <tbody>{absentees.map((s, i) => { const ec1 = s.emergency_contact_1 || ""; const ec2 = s.emergency_contact_2 || ""; const wa1 = ec1 ? makeWhatsAppUrl(ec1, s.student_name, s.roll_no, s.att.status) : null; const wa2 = ec2 ? makeWhatsAppUrl(ec2, s.student_name, s.roll_no, s.att.status) : null; return (
              <tr key={s.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                <td className="px-4 py-2.5 font-medium">{s.roll_no}</td><td className="px-4 py-2.5 font-medium">{s.student_name}</td><td className="px-4 py-2.5 text-muted-foreground">{s.grade}</td><td className="px-4 py-2.5 text-muted-foreground">{s.classroom_name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{ec1 ? (isAdminOrOwner ? ec1 : maskNumber(ec1)) : "—"}</td><td className="px-4 py-2.5 text-muted-foreground">{ec2 ? (isAdminOrOwner ? ec2 : maskNumber(ec2)) : "—"}</td>
                <td className="px-4 py-2.5 text-center"><span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${s.att.status === "AB" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}>{s.att.status === "AB" ? "Absent" : "Leave"}</span></td>
                <td className="px-4 py-2.5"><textarea value={remarks[s.id] || ""} onChange={(e) => setRemarks((prev) => ({ ...prev, [s.id]: e.target.value }))} placeholder="Enter reason..." className="w-full min-w-[180px] rounded-md border border-input bg-background px-2.5 py-1.5 text-xs resize-y" rows={2} /></td>
                <td className="px-4 py-2.5 text-center"><div className="flex items-center justify-center gap-1">{wa1 && <a href={wa1} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="h-7 w-7 p-0"><MessageCircle className="h-3.5 w-3.5 text-success" /></Button></a>}{wa2 && <a href={wa2} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" className="h-7 w-7 p-0"><MessageCircle className="h-3.5 w-3.5 text-primary" /></Button></a>}{!wa1 && !wa2 && <span className="text-xs text-muted-foreground">No number</span>}</div></td>
              </tr>); })}</tbody></table>
        </div>
      )}
    </div>
  );
};
export default AbsenteeDashboard;
