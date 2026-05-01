import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, Save, Users, Settings, ArrowLeft, UserPlus, Trash2, Crown, Clock, Loader2, ArrowUpToLine, RefreshCw, BookOpen, Plus, ExternalLink, CheckCircle2, Circle, Pencil, Info, Activity, Wifi } from "lucide-react";
import { PAGE_OPTIONS } from "@/config/pageOptions";
import ActivityLogViewer from "@/components/ActivityLogViewer";
import OnlineUsersWidget from "@/components/OnlineUsersWidget";
import { format } from "date-fns";

type UserRow = { user_id: string; email: string; full_name: string; role: string; status: string; pageAccess: Record<string, boolean>; };
type Dataset = { id: string; name: string; slug: string; sheet_url: string; is_active: boolean; display_order: number; updated_at?: string; };
type SyncTarget = { id: string; label: string; apps_script_url: string; purpose: string; is_active: boolean; created_at: string; };
type PageMapping = { id: string; page_name: string; dataset_id: string | null; dataset_slug: string | null; dataset_name: string | null; };

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

const AdminPanel = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"users" | "settings" | "datasets" | "logs" | "online">("datasets");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [syncTargets, setSyncTargets] = useState<SyncTarget[]>([]);
  const [pageMappings, setPageMappings] = useState<PageMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("teacher");
  const [creatingUser, setCreatingUser] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [addDatasetOpen, setAddDatasetOpen] = useState(false);
  const [editDataset, setEditDataset] = useState<Dataset | null>(null);
  const [newDatasetName, setNewDatasetName] = useState("");
  const [newDatasetUrl, setNewDatasetUrl] = useState("");
  const [newDatasetPages, setNewDatasetPages] = useState<string[]>([]);
  const [savingDataset, setSavingDataset] = useState(false);
  const [syncingDataset, setSyncingDataset] = useState<string | null>(null);
  const [deletingDataset, setDeletingDataset] = useState<Dataset | null>(null);
  const [testingUrl, setTestingUrl] = useState<string | null>(null);
  const [syncingPush, setSyncingPush] = useState(false);

  // Sync target dialog state
  const [addSyncTargetOpen, setAddSyncTargetOpen] = useState(false);
  const [editSyncTarget, setEditSyncTarget] = useState<SyncTarget | null>(null);
  const [newTargetLabel, setNewTargetLabel] = useState("");
  const [newTargetUrl, setNewTargetUrl] = useState("");
  const [newTargetPurpose, setNewTargetPurpose] = useState<"attendance" | "marks">("attendance");
  const [savingTarget, setSavingTarget] = useState(false);
  const [testingTarget, setTestingTarget] = useState<string | null>(null);
  const [restoringAttendance, setRestoringAttendance] = useState(false);
  const [restoreMode, setRestoreMode] = useState<"day" | "month" | "all">("day");
  const [restoreDate, setRestoreDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [restoreMonth, setRestoreMonth] = useState(String(new Date().getMonth() + 1));
  const [restoreYear, setRestoreYear] = useState(String(new Date().getFullYear()));

  const fetchUsers = async () => {
    const [{ data: profiles }, { data: roles }, { data: statuses }, { data: access }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_status").select("user_id, status"),
      supabase.from("page_access").select("user_id, page_name, has_access"),
    ]);
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r]));
    const statusMap = new Map((statuses ?? []).map((s: any) => [s.user_id, s.status]));
    const accessMap = new Map<string, Record<string, boolean>>();
    (access ?? []).forEach((a: any) => { if (!accessMap.has(a.user_id)) accessMap.set(a.user_id, {}); accessMap.get(a.user_id)![a.page_name] = a.has_access; });
    setUsers((profiles ?? []).map((p: any) => ({ user_id: p.user_id, email: p.email, full_name: p.full_name, role: (roleMap.get(p.user_id) as any)?.role ?? "teacher", status: statusMap.get(p.user_id) ?? "pending", pageAccess: accessMap.get(p.user_id) ?? {} })));
  };
  const fetchSettings = async () => { const { data } = await supabase.from("system_settings").select("key, value"); const map: Record<string, string> = {}; (data ?? []).forEach((r: any) => { map[r.key] = r.value; }); setSettings(map); };
  const fetchDatasets = async () => { const { data, error } = await supabase.from("student_datasets").select("*").order("display_order", { ascending: true }); if (!error) setDatasets((data ?? []) as Dataset[]); };
  const fetchSyncTargets = async () => { const { data } = await supabase.from("sync_targets").select("*").order("created_at"); setSyncTargets((data ?? []) as SyncTarget[]); };
  const fetchPageMappings = async () => { const { data } = await supabase.from("page_dataset_mapping").select("*"); setPageMappings((data ?? []) as PageMapping[]); };

  useEffect(() => { const load = async () => { setLoading(true); await Promise.all([fetchUsers(), fetchSettings(), fetchDatasets(), fetchSyncTargets(), fetchPageMappings()]); setLoading(false); }; load(); }, []);

  const updateRole = async (userId: string, role: string) => { await supabase.from("user_roles").upsert({ user_id: userId, role } as any, { onConflict: "user_id" }); fetchUsers(); toast.success("Role updated"); };
  const updateStatus = async (userId: string, status: string) => { await supabase.from("user_status").upsert({ user_id: userId, status } as any, { onConflict: "user_id" }); fetchUsers(); toast.success("Status updated"); };
  const togglePageAccess = async (userId: string, pageName: string, hasAccess: boolean) => { await supabase.from("page_access").upsert({ user_id: userId, page_name: pageName, has_access: hasAccess } as any, { onConflict: "user_id,page_name" }); fetchUsers(); };
  const saveUserRow = async (u: UserRow) => { await Promise.all([supabase.from("user_roles").upsert({ user_id: u.user_id, role: u.role } as any, { onConflict: "user_id" }), supabase.from("user_status").upsert({ user_id: u.user_id, status: u.status } as any, { onConflict: "user_id" })]); toast.success("User saved"); };
  const confirmDeleteUser = async () => { if (!deleteTarget) return; const userId = deleteTarget.user_id; await Promise.all([supabase.from("user_roles").delete().eq("user_id", userId), supabase.from("user_status").delete().eq("user_id", userId), supabase.from("page_access").delete().eq("user_id", userId), supabase.from("profiles").delete().eq("user_id", userId)]); setDeleteTarget(null); fetchUsers(); toast.success("User removed"); };
  const handleCreateUser = async () => { if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) { toast.error("Fill in all fields"); return; } if (newUserPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; } setCreatingUser(true); try { const { data, error } = await supabase.functions.invoke("create-user", { body: { email: newUserEmail.trim(), password: newUserPassword, full_name: newUserName.trim(), role: newUserRole } }); if (error) throw error; if (data?.error) { toast.error(data.error); setCreatingUser(false); return; } toast.success("User created!"); setCreateDialogOpen(false); setNewUserName(""); setNewUserEmail(""); setNewUserPassword(""); setNewUserRole("teacher"); fetchUsers(); } catch (err: any) { toast.error("Failed: " + (err.message || "Unknown error")); } setCreatingUser(false); };

  const syncDataset = async (slug: string) => { setSyncingDataset(slug); try { const { data, error } = await supabase.functions.invoke("sync-google-sheet", { body: { dataset_slug: slug } }); if (error) throw error; if (data?.success) { const warn = data.warning ? ` (⚠️ ${data.warning})` : ''; toast.success(`✅ Synced ${data.synced} of ${data.total} students from "${data.dataset_name}"${warn}`, { duration: 6000 }); fetchDatasets(); fetchSettings(); } else { toast.error(`❌ Sync failed: ${data?.error || "Unknown error"}`, { duration: 12000 }); } } catch (err: any) { toast.error(`❌ Sync failed: ${err?.message || "Check URL"}`); } setSyncingDataset(null); };

  const testDatasetUrl = async (slug: string, url: string) => { if (!url) { toast.error("No URL configured"); return; } setTestingUrl(slug); try { let csvUrl = url; if (csvUrl.includes('/pubhtml')) csvUrl = csvUrl.replace('/pubhtml', '/pub'); if (!csvUrl.includes('output=csv')) csvUrl += (csvUrl.includes('?') ? '&' : '?') + 'output=csv'; const res = await fetch(csvUrl); const text = await res.text(); if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) { toast.error("URL returned HTML — check gid and output=csv"); } else { const rowCount = text.split('\n').filter(r => r.trim()).length - 1; toast.success(`✅ Valid! ${rowCount} student rows`); } } catch { toast.error("Could not reach URL"); } setTestingUrl(null); };

  // Get pages currently mapped to a dataset
  const getPagesForDataset = (datasetId: string): string[] => {
    return pageMappings.filter(m => m.dataset_id === datasetId).map(m => m.page_name);
  };

  const saveDataset = async () => {
    if (!newDatasetName.trim()) { toast.error("Enter a dataset name"); return; }
    setSavingDataset(true);
    try {
      const slug = editDataset ? editDataset.slug : toSlug(newDatasetName);
      let datasetId = editDataset?.id;

      if (editDataset) {
        await supabase.from("student_datasets").update({ name: newDatasetName.trim(), sheet_url: newDatasetUrl.trim(), is_active: true, updated_at: new Date().toISOString() } as any).eq("id", editDataset.id);
      } else {
        const maxOrder = datasets.reduce((m, d) => Math.max(m, d.display_order), 0);
        const { data: inserted, error } = await supabase.from("student_datasets").insert({ name: newDatasetName.trim(), slug, sheet_url: newDatasetUrl.trim(), is_active: true, display_order: maxOrder + 1 } as any).select("id").single();
        if (error) {
          if (error.message?.includes('unique') || error.code === '23505') toast.error(`Dataset with similar name exists`);
          else throw error;
          setSavingDataset(false); return;
        }
        datasetId = (inserted as any)?.id;
      }

      // Update page_dataset_mapping for selected pages
      if (datasetId) {
        // Remove old mappings for this dataset
        await supabase.from("page_dataset_mapping").delete().eq("dataset_id", datasetId);
        // Insert new mappings
        if (newDatasetPages.length > 0) {
          const mappings = newDatasetPages.map(pageName => ({
            page_name: pageName,
            dataset_id: datasetId,
            dataset_slug: slug,
            dataset_name: newDatasetName.trim(),
          }));
          // Remove existing mappings for these pages from other datasets
          for (const pageName of newDatasetPages) {
            await supabase.from("page_dataset_mapping").delete().eq("page_name", pageName).neq("dataset_id", datasetId!);
          }
          await supabase.from("page_dataset_mapping").insert(mappings as any);
        }
      }

      toast.success(editDataset ? `Updated "${newDatasetName}"` : `Added "${newDatasetName}"`);
      setAddDatasetOpen(false); setEditDataset(null); setNewDatasetName(""); setNewDatasetUrl(""); setNewDatasetPages([]);
      await Promise.all([fetchDatasets(), fetchPageMappings()]);
    } catch (err: any) { toast.error("Failed: " + (err.message || "Unknown")); }
    setSavingDataset(false);
  };

  const openEdit = (ds: Dataset) => {
    setEditDataset(ds);
    setNewDatasetName(ds.name);
    setNewDatasetUrl(ds.sheet_url);
    setNewDatasetPages(getPagesForDataset(ds.id));
    setAddDatasetOpen(true);
  };

  const openAddNew = () => {
    setEditDataset(null);
    setNewDatasetName("");
    setNewDatasetUrl("");
    setNewDatasetPages([]);
    setAddDatasetOpen(true);
  };

  const confirmDeleteDataset = async () => {
    if (!deletingDataset) return;
    try {
      await supabase.from("page_dataset_mapping").delete().eq("dataset_id", deletingDataset.id);
      await supabase.from("students").delete().eq("dataset", deletingDataset.slug);
      await supabase.from("student_datasets").delete().eq("id", deletingDataset.id);
      toast.success(`Deleted "${deletingDataset.name}"`);
      await Promise.all([fetchDatasets(), fetchPageMappings()]);
    } catch { toast.error("Failed to delete"); }
    setDeletingDataset(null);
  };

  const saveSettings = async () => { setSavingSettings(true); try { for (const [key, value] of Object.entries(settings)) { await supabase.from("system_settings").upsert({ key, value, updated_at: new Date().toISOString() } as any, { onConflict: "key" }); } toast.success("Settings saved!"); await queryClient.invalidateQueries({ queryKey: ["system-settings"] }); } catch { toast.error("Failed to save"); } setSavingSettings(false); };

  // Sync targets
  const handlePushSync = async (mode: "full" | "attendance" = "attendance") => {
    setSyncingPush(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const body: any = { date: today };
      if (mode === "full") body.only = ["sync_master", "sync_attendance", "sync_absentees", "sync_analytics"];
      // attendance mode uses default (skips sync_master) for speed
      const { data, error } = await supabase.functions.invoke("sync-to-sheet", { body });
      if (error) throw error;
      if (data?.success) {
        const results = data.results ?? [];
        if (data.queued) {
          toast.success(`✅ Sync queued to ${data.targets ?? syncTargets.filter(t => t.is_active).length} target(s) — ${data.attendance_records ?? 0} records`, { duration: 6000 });
          fetchSettings();
          return;
        }
        const successCount = results.filter((r: any) => r.success).length;
        toast.success(`✅ Pushed to ${successCount}/${results.length} target(s) — ${data.attendance_records ?? 0} records`, { duration: 6000 });
        if (results.some((r: any) => !r.success)) {
          const failures = results.filter((r: any) => !r.success).map((r: any) => `${r.label}: ${r.error}`);
          toast.error(`Some targets failed: ${failures.join(", ")}`, { duration: 10000 });
        }
        fetchSettings();
      } else {
        toast.error(`Push failed: ${data?.error || "Unknown"}`, { duration: 10000 });
      }
    } catch (err: any) { toast.error("Push failed: " + (err.message || "Unknown error")); }
    setSyncingPush(false);
  };

  const saveSyncTarget = async () => {
    if (!newTargetLabel.trim() || !newTargetUrl.trim()) { toast.error("Fill label and URL"); return; }
    setSavingTarget(true);
    try {
      if (editSyncTarget) {
        await supabase.from("sync_targets").update({ label: newTargetLabel.trim(), apps_script_url: newTargetUrl.trim(), purpose: newTargetPurpose } as any).eq("id", editSyncTarget.id);
        toast.success("Target updated");
      } else {
        await supabase.from("sync_targets").insert({ label: newTargetLabel.trim(), apps_script_url: newTargetUrl.trim(), purpose: newTargetPurpose } as any);
        toast.success("Target added");
      }
      setAddSyncTargetOpen(false); setEditSyncTarget(null); setNewTargetLabel(""); setNewTargetUrl(""); setNewTargetPurpose("attendance");
      fetchSyncTargets();
    } catch (err: any) { toast.error("Failed: " + err.message); }
    setSavingTarget(false);
  };

  const lastSyncAt = settings.last_sync_at;

  const toggleDatasetPage = (page: string) => {
    setNewDatasetPages(prev => prev.includes(page) ? prev.filter(p => p !== page) : [...prev, page]);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="w-full px-4 py-6 max-w-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div><h2 className="text-2xl font-bold text-foreground">Admin Panel</h2><p className="text-sm text-muted-foreground">Manage accounts, datasets, and system settings</p></div>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild><Button className="gap-1.5"><UserPlus className="h-4 w-4" /> Create New User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create New User</DialogTitle><DialogDescription>Create a new user account.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2"><Label>Full Name</Label><Input placeholder="Full name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} /></div>
              <div className="space-y-2"><Label>Password</Label><Input type="password" placeholder="Min 6 characters" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} /></div>
              <div className="space-y-2"><Label>Role</Label><Select value={newUserRole} onValueChange={setNewUserRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="teacher">Teacher</SelectItem></SelectContent></Select></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button><Button onClick={handleCreateUser} disabled={creatingUser}>{creatingUser ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Creating...</> : "Create User"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6 flex gap-2 flex-wrap">
        <Button variant={tab === "datasets" ? "default" : "outline"} onClick={() => setTab("datasets")} className="gap-1.5"><BookOpen className="h-4 w-4" /> Student Datasets</Button>
        <Button variant={tab === "users" ? "default" : "outline"} onClick={() => setTab("users")} className="gap-1.5"><Users className="h-4 w-4" /> Users</Button>
        <Button variant={tab === "settings" ? "default" : "outline"} onClick={() => setTab("settings")} className="gap-1.5"><Settings className="h-4 w-4" /> System Settings</Button>
        <Button variant={tab === "logs" ? "default" : "outline"} onClick={() => setTab("logs")} className="gap-1.5"><Activity className="h-4 w-4" /> Activity Logs</Button>
        <Button variant={tab === "online" ? "default" : "outline"} onClick={() => setTab("online")} className="gap-1.5"><Wifi className="h-4 w-4" /> Live Users</Button>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove User</AlertDialogTitle><AlertDialogDescription>Permanently remove <strong>{deleteTarget?.full_name}</strong>?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={!!deletingDataset} onOpenChange={(open) => { if (!open) setDeletingDataset(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Dataset</AlertDialogTitle><AlertDialogDescription>Delete <strong>"{deletingDataset?.name}"</strong> and all its student records?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteDataset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Dataset</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      {/* Add/Edit Dataset Dialog */}
      <Dialog open={addDatasetOpen} onOpenChange={(open) => { setAddDatasetOpen(open); if (!open) { setEditDataset(null); setNewDatasetName(""); setNewDatasetUrl(""); setNewDatasetPages([]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editDataset ? "Edit Dataset" : "Add New Dataset"}</DialogTitle><DialogDescription>{editDataset ? "Update name, URL, and page mappings." : "Add a new student data source and assign it to dashboards."}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Dataset Name <span className="text-destructive">*</span></Label><Input placeholder="e.g. Master List Adilabad" value={newDatasetName} onChange={(e) => setNewDatasetName(e.target.value)} />{newDatasetName && !editDataset && <p className="text-xs text-muted-foreground">Internal ID: <code className="bg-muted px-1 rounded">{toSlug(newDatasetName)}</code></p>}</div>
            <div className="space-y-2"><Label>Google Sheet CSV URL</Label><Input placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&output=csv" value={newDatasetUrl} onChange={(e) => setNewDatasetUrl(e.target.value)} className="text-xs" /></div>
            <div className="space-y-2">
              <Label>Linked Navigation Pages</Label>
              <p className="text-xs text-muted-foreground">Select which dashboards will use this dataset's students.</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {PAGE_OPTIONS.map(page => {
                  const isSelected = newDatasetPages.includes(page);
                  // Check if another dataset already claims this page
                  const otherMapping = pageMappings.find(m => m.page_name === page && m.dataset_id !== editDataset?.id);
                  return (
                    <label key={page} className={`flex items-center gap-2 text-sm cursor-pointer rounded-lg border px-3 py-2 transition-colors ${isSelected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleDatasetPage(page)}
                      />
                      <span className="flex-1">{page}</span>
                      {otherMapping && !isSelected && (
                        <span className="text-[10px] text-amber-600">({pageMappings.find(m => m.page_name === page)?.dataset_name})</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAddDatasetOpen(false); setEditDataset(null); }}>Cancel</Button><Button onClick={saveDataset} disabled={savingDataset || !newDatasetName.trim()}>{savingDataset ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : (editDataset ? "Save Changes" : "Add Dataset")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Sync Target Dialog */}
      <Dialog open={addSyncTargetOpen} onOpenChange={(open) => { setAddSyncTargetOpen(open); if (!open) { setEditSyncTarget(null); setNewTargetLabel(""); setNewTargetUrl(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editSyncTarget ? "Edit Sync Target" : "Add Sync Target"}</DialogTitle><DialogDescription>Enter the Apps Script Web App URL for pushing attendance data.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Label <span className="text-destructive">*</span></Label><Input placeholder="e.g. Main Attendance Sheet" value={newTargetLabel} onChange={(e) => setNewTargetLabel(e.target.value)} /></div>
            <div className="space-y-2"><Label>Apps Script URL <span className="text-destructive">*</span></Label><Input placeholder="https://script.google.com/macros/s/.../exec" value={newTargetUrl} onChange={(e) => setNewTargetUrl(e.target.value)} className="text-xs" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAddSyncTargetOpen(false); setEditSyncTarget(null); }}>Cancel</Button><Button onClick={saveSyncTarget} disabled={savingTarget}>{savingTarget ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : (editSyncTarget ? "Save Changes" : "Add Target")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {tab === "datasets" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div><h3 className="text-lg font-bold text-foreground">Student Datasets</h3><p className="text-sm text-muted-foreground mt-0.5">Each dataset can be linked to specific navigation pages/dashboards.</p></div>
            <Button onClick={openAddNew} className="gap-1.5 shrink-0"><Plus className="h-4 w-4" /> Add New Dataset</Button>
          </div>

          <div className="space-y-3">
            {datasets.map((ds) => {
              const isSyncing = syncingDataset === ds.slug;
              const isTesting = testingUrl === ds.slug;
              const hasUrl = !!ds.sheet_url?.trim();
              const linkedPages = getPagesForDataset(ds.id);

              return (
                <div key={ds.id} className="rounded-xl border-2 border-border bg-card p-5 hover:border-muted-foreground/30 transition-all">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="mt-0.5"><BookOpen className="h-5 w-5 text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-foreground">{ds.name}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">{ds.slug}</span>
                      </div>
                      {hasUrl ? <p className="text-xs text-muted-foreground mt-1 truncate max-w-xl">{ds.sheet_url.slice(0, 80)}...</p> : <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><Info className="h-3.5 w-3.5" /> No CSV URL — click Edit</p>}
                      {ds.updated_at && <p className="text-xs text-muted-foreground mt-0.5">Last synced: {format(new Date(ds.updated_at), "dd MMM yyyy, hh:mm a")}</p>}
                      {/* Show linked pages */}
                      {linkedPages.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {linkedPages.map(p => (
                            <span key={p} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{p}</span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><Info className="h-3.5 w-3.5" /> Not linked to any page — click Edit to assign</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {hasUrl && <Button variant="outline" size="sm" onClick={() => testDatasetUrl(ds.slug, ds.sheet_url)} disabled={isTesting} className="gap-1 h-8 text-xs">{isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Test URL</Button>}
                      <Button variant="outline" size="sm" onClick={() => syncDataset(ds.slug)} disabled={isSyncing || !hasUrl} className="gap-1 h-8 text-xs">{isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{isSyncing ? "Syncing..." : "Sync from Sheet"}</Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(ds)} className="gap-1 h-8 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button variant="outline" size="sm" onClick={() => setDeletingDataset(ds)} className="gap-1 h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sync Targets Section */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><ArrowUpToLine className="h-4 w-4 text-primary" /><h4 className="font-semibold text-foreground text-sm">Apps Script Sync Targets</h4></div>
              <Button size="sm" onClick={() => setAddSyncTargetOpen(true)} className="gap-1 h-8 text-xs"><Plus className="h-3.5 w-3.5" /> Add Target</Button>
            </div>
            {syncTargets.length === 0 && <p className="text-xs text-muted-foreground">No sync targets. Add an Apps Script URL to enable push sync.</p>}
            {syncTargets.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.apps_script_url.slice(0, 70)}...</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Switch checked={t.is_active} onCheckedChange={async (v) => { await supabase.from("sync_targets").update({ is_active: v } as any).eq("id", t.id); fetchSyncTargets(); }} />
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={testingTarget === t.id}
                    onClick={async () => {
                      setTestingTarget(t.id);
                      try {
                        const { data, error } = await supabase.functions.invoke("test-sync-target", { body: { url: t.apps_script_url } });
                        if (error) { toast.error(`❌ ${t.label}: ${error.message}`); }
                        else if (data?.success) toast.success(`✅ ${t.label} is working (${data.elapsed_ms}ms)`);
                        else toast.error(`❌ ${t.label}: ${data?.error ?? "Failed"}`, { duration: 12000 });
                      } catch (e: any) { toast.error("Test failed: " + (e?.message ?? "Unknown")); }
                      setTestingTarget(null);
                    }}>
                    {testingTarget === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Test
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditSyncTarget(t); setNewTargetLabel(t.label); setNewTargetUrl(t.apps_script_url); setAddSyncTargetOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30" onClick={async () => { await supabase.from("sync_targets").delete().eq("id", t.id); fetchSyncTargets(); toast.success("Removed"); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
            {lastSyncAt && <p className="text-xs text-muted-foreground">Last sync: {format(new Date(lastSyncAt), "dd MMM yyyy, hh:mm a")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handlePushSync("attendance")} disabled={syncingPush || syncTargets.filter(t => t.is_active).length === 0} variant="outline" className="gap-1.5">
                {syncingPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpToLine className="h-4 w-4" />}
                Push Today's Attendance (fast)
              </Button>
              <Button onClick={() => handlePushSync("full")} disabled={syncingPush || syncTargets.filter(t => t.is_active).length === 0} variant="outline" className="gap-1.5">
                <ArrowUpToLine className="h-4 w-4" />
                Push Full (incl. Master Student List)
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === "users" && (
        <>
          <div className="mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-semibold">Users ({users.length})</span></div>
          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-primary/5"><th className="px-4 py-3 text-left font-bold text-primary">Full Name</th><th className="px-4 py-3 text-left font-bold text-primary">Email</th><th className="px-4 py-3 text-center font-bold text-primary">Role</th><th className="px-4 py-3 text-left font-bold text-primary">Page Access</th><th className="px-4 py-3 text-center font-bold text-primary">Status</th><th className="px-4 py-3 text-center font-bold text-primary">Actions</th></tr></thead>
              <tbody>
                {users.map((u, i) => {
                  const isOwner = u.role === "owner"; const isSelf = user?.id === u.user_id;
                  return (
                    <tr key={u.user_id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                      <td className="px-4 py-3 font-medium"><div className="flex items-center gap-2">{isOwner && <Crown className="h-4 w-4 text-primary" />}{u.full_name}</div></td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                      <td className="px-4 py-3 text-center">{isOwner ? <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Owner</span> : <Select value={u.role} onValueChange={(v) => updateRole(u.user_id, v)}><SelectTrigger className="h-8 w-24 text-xs mx-auto"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="teacher">Teacher</SelectItem></SelectContent></Select>}</td>
                      <td className="px-4 py-3">{isOwner ? <span className="text-xs text-muted-foreground">All Access</span> : <div className="flex flex-wrap gap-x-3 gap-y-1">{PAGE_OPTIONS.map((p) => <label key={p} className="flex items-center gap-1.5 text-xs cursor-pointer"><Checkbox checked={u.pageAccess[p] ?? false} onCheckedChange={(checked) => togglePageAccess(u.user_id, p, !!checked)} className="h-4 w-4" />{p}</label>)}</div>}</td>
                      <td className="px-4 py-3 text-center">{isOwner ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span> : <Select value={u.status} onValueChange={(v) => updateStatus(u.user_id, v)}><SelectTrigger className="h-8 w-24 text-xs mx-auto"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="blocked">Blocked</SelectItem></SelectContent></Select>}</td>
                      <td className="px-4 py-3 text-center">{isOwner && isSelf ? <span className="text-xs text-muted-foreground">(You)</span> : !isOwner ? <div className="flex items-center justify-center gap-1.5"><Button variant="outline" size="sm" onClick={() => saveUserRow(u)} className="gap-1 h-8"><Save className="h-3.5 w-3.5" /> Save</Button><Button variant="destructive" size="sm" onClick={() => setDeleteTarget(u)} className="gap-1 h-8"><Trash2 className="h-3.5 w-3.5" /></Button></div> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "settings" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border p-6">
            <div className="flex items-center gap-2 mb-4"><Clock className="h-5 w-5 text-primary" /><h3 className="text-base font-bold">Auto-Sync Interval</h3></div>
            <div className="space-y-2"><Label>Minutes between auto-syncs (0 = disabled)</Label><Input type="number" min="0" value={settings.sync_interval_minutes ?? "0"} onChange={(e) => setSettings(prev => ({ ...prev, sync_interval_minutes: e.target.value }))} className="text-sm w-32" /></div>
          </div>
          <div className="rounded-lg border border-border p-6">
            <div className="flex items-center gap-2 mb-4"><Settings className="h-5 w-5 text-primary" /><h3 className="text-base font-bold">Other Settings</h3></div>
            <div className="space-y-4">
              {[{ key: "web_app_url", label: "Web App URL" }, { key: "linked_app_url_1", label: "Linked App 1 URL" }, { key: "linked_app_url_1_label", label: "Linked App 1 Label" }, { key: "linked_app_url_2", label: "Linked App 2 URL" }, { key: "linked_app_url_2_label", label: "Linked App 2 Label" }, { key: "auto_approve_google", label: "Auto-Approve Google Sign-ins (true/false)" }].map(({ key, label }) => (
                <div key={key} className="space-y-1"><Label className="text-sm">{label}</Label><Input value={settings[key] ?? ""} onChange={(e) => setSettings(prev => ({ ...prev, [key]: e.target.value }))} className="text-sm" /></div>
              ))}
            </div>
          </div>
          <div className="flex justify-end"><Button onClick={saveSettings} disabled={savingSettings} className="gap-1.5"><Save className="h-4 w-4" /> {savingSettings ? "Saving..." : "Save All Settings"}</Button></div>
          {userRole === "owner" && (
            <>
            <div className="rounded-lg border border-border p-6">
              <div className="flex items-center gap-2 mb-2"><RefreshCw className="h-5 w-5 text-primary" /><h3 className="text-base font-bold">Restore Attendance from Logs</h3></div>
              <p className="text-sm text-muted-foreground mb-4">Reconstruct missing attendance records from activity logs by matching student names. Only missing records are inserted — existing ones are not overwritten.</p>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(["day", "month", "all"] as const).map(m => (
                    <Button key={m} variant={restoreMode === m ? "default" : "outline"} size="sm" onClick={() => setRestoreMode(m)} className="capitalize">
                      {m === "day" ? "Day-wise" : m === "month" ? "Month-wise" : "Overall"}
                    </Button>
                  ))}
                </div>
                {restoreMode === "day" && (
                  <div className="space-y-1">
                    <Label className="text-sm">Select Date</Label>
                    <Input type="date" value={restoreDate} onChange={e => setRestoreDate(e.target.value)} className="w-48 text-sm" />
                  </div>
                )}
                {restoreMode === "month" && (
                  <div className="flex gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm">Month</Label>
                      <Select value={restoreMonth} onValueChange={setRestoreMonth}>
                        <SelectTrigger className="w-32 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                            <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Year</Label>
                      <Select value={restoreYear} onValueChange={setRestoreYear}>
                        <SelectTrigger className="w-24 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[2024, 2025, 2026, 2027].map(y => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {restoreMode === "all" && (
                  <p className="text-xs text-destructive font-medium">⚠️ This will scan ALL activity logs and restore all missing attendance records.</p>
                )}
                <Button variant="destructive" disabled={restoringAttendance} onClick={async () => {
                  setRestoringAttendance(true);
                  try {
                    // Always send all 3 params so we hit the (date, month, year) overload, not the no-arg one.
                    const params: any = { _date: null, _month: null, _year: null };
                    if (restoreMode === "day") params._date = restoreDate;
                    else if (restoreMode === "month") { params._month = parseInt(restoreMonth); params._year = parseInt(restoreYear); }
                    const { data, error } = await supabase.rpc("restore_attendance_from_logs" as any, params);
                    if (error) throw error;
                    const label = restoreMode === "day" ? `for ${restoreDate}` : restoreMode === "month" ? `for ${["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(restoreMonth)]} ${restoreYear}` : "(all dates)";
                    toast.success(`✅ Restored ${data} attendance records ${label}`, { duration: 8000 });
                  } catch (err: any) { toast.error("Restore failed: " + (err.message || "Unknown")); }
                  setRestoringAttendance(false);
                }} className="gap-1.5">
                  {restoringAttendance ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {restoringAttendance ? "Restoring..." : `Restore ${restoreMode === "day" ? "Day" : restoreMode === "month" ? "Month" : "All"}`}
                </Button>
              </div>
            </div>
            </>
          )}
        </div>
      )}
      {tab === "logs" && <ActivityLogViewer />}
      {tab === "online" && <OnlineUsersWidget />}
    </div>
  );
};

export default AdminPanel;
