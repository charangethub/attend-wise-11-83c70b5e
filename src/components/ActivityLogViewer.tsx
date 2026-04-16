import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, RefreshCw, Activity, Maximize2 } from "lucide-react";

const ActivityLogViewer = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [userFilter, setUserFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [detailLog, setDetailLog] = useState<any>(null);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (dateFilter) {
      query = query.gte("created_at", `${dateFilter}T00:00:00`).lte("created_at", `${dateFilter}T23:59:59`);
    }
    if (userFilter !== "all") {
      query = query.eq("user_id", userFilter);
    }

    const { data } = await query;
    setLogs(data ?? []);
    setLoading(false);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from("profiles").select("user_id, full_name");
    setUsers((data ?? []).map((p: any) => ({ id: p.user_id, name: p.full_name })));
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { fetchLogs(); }, [dateFilter, userFilter]);

  const filteredLogs = searchQuery
    ? logs.filter((l) => {
        const q = searchQuery.toLowerCase();
        return (
          l.user_name?.toLowerCase().includes(q) ||
          l.student_name?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q)
        );
      })
    : logs;

  const getActionColor = (action: string) => {
    if (action.includes("save") || action.includes("mark")) return "bg-success/10 text-success";
    if (action.includes("delete") || action.includes("clear")) return "bg-destructive/10 text-destructive";
    if (action.includes("update") || action.includes("edit")) return "bg-warning/10 text-warning";
    return "bg-primary/10 text-primary";
  };

  const formatDetails = (details: any) => {
    if (!details || typeof details !== "object" || Object.keys(details).length === 0) return "—";
    return Object.entries(details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Activity Logs</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Date:</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search logs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : filteredLogs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No activity logs for this date</p>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto overflow-y-auto max-h-[600px]">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/80 backdrop-blur">
                <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">Time</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">User</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">Action</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">Student</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap min-w-[300px]">Details</th>
                <th className="px-3 py-2 text-center font-semibold text-foreground whitespace-nowrap">View</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log, i) => (
                <tr key={log.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.created_at), "hh:mm:ss a")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-medium text-foreground">{log.user_name}</span>
                    <br /><span className="text-[10px] text-muted-foreground">{log.user_email}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{log.student_name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div className="max-w-[400px] overflow-x-auto whitespace-nowrap scrollbar-thin">
                      {formatDetails(log.details)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => setDetailLog(log)} className="rounded p-1 hover:bg-muted transition-colors" title="View full details">
                      <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Showing {filteredLogs.length} log entries</p>

      {/* Detail Dialog */}
      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Activity Log Details</DialogTitle></DialogHeader>
          {detailLog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Time:</span><br/><span className="font-medium">{format(new Date(detailLog.created_at), "dd MMM yyyy, hh:mm:ss a")}</span></div>
                <div><span className="text-muted-foreground">User:</span><br/><span className="font-medium">{detailLog.user_name}</span></div>
                <div><span className="text-muted-foreground">Email:</span><br/><span className="font-medium">{detailLog.user_email}</span></div>
                <div><span className="text-muted-foreground">Action:</span><br/><span className="font-medium">{detailLog.action}</span></div>
                <div><span className="text-muted-foreground">Student:</span><br/><span className="font-medium">{detailLog.student_name || "—"}</span></div>
                <div><span className="text-muted-foreground">Entity:</span><br/><span className="font-medium">{detailLog.entity_type}</span></div>
              </div>
              <div>
                <span className="text-muted-foreground">Full Details:</span>
                <pre className="mt-1 whitespace-pre-wrap break-all text-xs bg-muted p-3 rounded-lg max-h-60 overflow-auto font-mono">
                  {detailLog.details && typeof detailLog.details === "object"
                    ? JSON.stringify(detailLog.details, null, 2)
                    : "—"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivityLogViewer;
