import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, Save, Users, Settings, ArrowLeft, UserPlus, Trash2, Crown, Clock, Loader2, ArrowUpToLine, RefreshCw, BookOpen, Plus, ExternalLink, CheckCircle2, Circle, Pencil, Info, Activity, Wifi } from "lucide-react";
import { PAGE_OPTIONS } from "@/config/pageOptions";
import { format } from "date-fns";

type UserRow = { user_id: string; email: string; full_name: string; role: string; status: string; pageAccess: Record<string, boolean>; };
type Dataset = { id: string; name: string; slug: string; sheet_url: string; is_active: boolean; display_order: number; updated_at?: string; };

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
  const [savingDataset, setSavingDataset] = useState(false);
  const [switchingDataset, setSwitchingDataset] = useState<string | null>(null);
  const [syncingDataset, setSyncingDataset] = useState<string | null>(null);
  const [deletingDataset, setDeletingDataset] = useState<Dataset | null>(null);
  const [testingUrl, setTestingUrl] = useState<string | null>(null);
  const [syncingPush, setSyncingPush] = useState(false);
  const [testingScriptUrl, setTestingScriptUrl] = useState(false);

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

  useEffect(() => { const load = async () => { setLoading(true); await Promise.all([fetchUsers(), fetchSettings(), fetchDatasets()]); setLoading(false); }; load(); }, []);

  const updateRole = async (userId: string, role: string) => { await supabase.from("user_roles").upsert({ user_id: userId, role } as any, { onConflict: "user_id" }); fetchUsers(); toast.success("Role updated"); };
  const updateStatus = async (userId: string, status: string) => { await supabase.from("user_status").upsert({ user_id: userId, status } as any, { onConflict: "user_id" }); fetchUsers(); toast.success("Status updated"); };
  const togglePageAccess = async (userId: string, pageName: string, hasAccess: boolean) => { await supabase.from("page_access").upsert({ user_id: userId, page_name: pageName, has_access: hasAccess } as any, { onConflict: "user_id,page_name" }); fetchUsers(); };
  const saveUserRow = async (u: UserRow) => { await Promise.all([supabase.from("user_roles").upsert({ user_id: u.user_id, role: u.role } as any, { onConflict: "user_id" }), supabase.from("user_status").upsert({ user_id: u.user_id, status: u.status } as any, { onConflict: "user_id" })]); toast.success("User saved"); };
  const confirmDeleteUser = async () => { if (!deleteTarget) return; const userId = deleteTarget.user_id; await Promise.all([supabase.from("user_roles").delete().eq("user_id", userId), supabase.from("user_status").delete().eq("user_id", userId), supabase.from("page_access").delete().eq("user_id", userId), supabase.from("profiles").delete().eq("user_id", userId)]); setDeleteTarget(null); fetchUsers(); toast.success("User removed"); };
  const handleCreateUser = async () => { if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) { toast.error("Fill in all fields"); return; } if (newUserPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; } setCreatingUser(true); try { const { data, error } = await supabase.functions.invoke("create-user", { body: { email: newUserEmail.trim(), password: newUserPassword, full_name: newUserName.trim(), role: newUserRole } }); if (error) throw error; if (data?.error) { toast.error(data.error); setCreatingUser(false); return; } toast.success("User created!"); setCreateDialogOpen(false); setNewUserName(""); setNewUserEmail(""); setNewUserPassword(""); setNewUserRole("teacher"); fetchUsers(); } catch (err: any) { toast.error("Failed: " + (err.message || "Unknown error")); } setCreatingUser(false); };

  const activeDataset = datasets.find(d => d.is_active);
  const switchDataset = async (slug: string) => { setSwitchingDataset(slug); try { await supabase.from("student_datasets").update({ is_active: false } as any).neq("slug", "__none__"); await supabase.from("student_datasets").update({ is_active: true } as any).eq("slug", slug); await fetchDatasets(); await queryClient.invalidateQueries({ queryKey: ["active-dataset"] }); const ds = datasets.find(d => d.slug === slug); toast.success(`Switched to "${ds?.name}"`); } catch { toast.error("Failed to switch dataset"); } setSwitchingDataset(null); };

  const syncDataset = async (slug: string) => { setSyncingDataset(slug); try { const { data, error } = await supabase.functions.invoke("sync-google-sheet", { body: { dataset_slug: slug } }); if (error) throw error; if (data?.success) { const warn = data.warning ? ` (⚠️ ${data.warning})` : ''; toast.success(`✅ Synced ${data.synced} of ${data.total} students from "${data.dataset_name}"${warn}`, { duration: 6000 }); fetchDatasets(); fetchSettings(); } else { toast.error(`❌ Sync failed: ${data?.error || "Unknown error"}`, { duration: 12000 }); } } catch (err: any) { toast.error(`❌ Sync failed: ${err?.message || "Check URL"}`); } setSyncingDataset(null); };

  const testDatasetUrl = async (slug: string, url: string) => { if (!url) { toast.error("No URL configured"); return; } setTestingUrl(slug); try { let csvUrl = url; if (csvUrl.includes('/pubhtml')) csvUrl = csvUrl.replace('/pubhtml', '/pub'); if (!csvUrl.includes('output=csv')) csvUrl += (csvUrl.includes('?') ? '&' : '?') + 'output=csv'; const res = await fetch(csvUrl); const text = await res.text(); if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) { toast.error("URL returned HTML — check gid and output=csv"); } else { const rowCount = text.split('\n').filter(r => r.trim()).length - 1; toast.success(`✅ Valid! ${rowCount} student rows`); } } catch { toast.error("Could not reach URL"); } setTestingUrl(null); };

  const saveDataset = async () => { if (!newDatasetName.trim()) { toast.error("Enter a dataset name"); return; } setSavingDataset(true); try { const slug = toSlug(newDatasetName); if (editDataset) { await supabase.from("student_datasets").update({ name: newDatasetName.trim(), sheet_url: newDatasetUrl.trim(), updated_at: new Date().toISOString() } as any).eq("id", editDataset.id); toast.success(`Updated "${newDatasetName}"`); } else { const maxOrder = datasets.reduce((m, d) => Math.max(m, d.display_order), 0); const { error } = await supabase.from("student_datasets").insert({ name: newDatasetName.trim(), slug, sheet_url: newDatasetUrl.trim(), is_active: false, display_order: maxOrder + 1 } as any); if (error) { if (error.message?.includes('unique') || error.code === '23505') toast.error(`Dataset with similar name exists`); else throw error; setSavingDataset(false); return; } toast.success(`Added "${newDatasetName}"`); } setAddDatasetOpen(false); setEditDataset(null); setNewDatasetName(""); setNewDatasetUrl(""); await fetchDatasets(); } catch (err: any) { toast.error("Failed: " + (err.message || "Unknown")); } setSavingDataset(false); };
  const openEdit = (ds: Dataset) => { setEditDataset(ds); setNewDatasetName(ds.name); setNewDatasetUrl(ds.sheet_url); setAddDatasetOpen(true); };
  const confirmDeleteDataset = async () => { if (!deletingDataset) return; if (deletingDataset.is_active) { toast.error("Cannot delete active dataset."); setDeletingDataset(null); return; } try { await supabase.from("students").delete().eq("dataset", deletingDataset.slug); await supabase.from("student_datasets").delete().eq("id", deletingDataset.id); toast.success(`Deleted "${deletingDataset.name}"`); fetchDatasets(); } catch { toast.error("Failed to delete"); } setDeletingDataset(null); };
  const saveSettings = async () => { setSavingSettings(true); try { for (const [key, value] of Object.entries(settings)) { await supabase.from("system_settings").upsert({ key, value, updated_at: new Date().toISOString() } as any, { onConflict: "key" }); } toast.success("Settings saved!"); await queryClient.invalidateQueries({ queryKey: ["system-settings"] }); } catch { toast.error("Failed to save"); } setSavingSettings(false); };
  const handlePushSync = async () => { setSyncingPush(true); try { const today = format(new Date(), "yyyy-MM-dd"); const { data, error } = await supabase.functions.invoke("sync-to-sheet", { body: { date: today } }); if (error) throw error; if (data?.success) { toast.success(`✅ Pushed to Google Sheet — ${data.attendance_records ?? 0} records synced`, { duration: 6000 }); } else { const errMsg = data?.errors?.[0] || data?.error || "Check that your Apps Script URL is current"; toast.error(`Push failed: ${errMsg}`, { duration: 10000 }); } } catch (err: any) { toast.error("Push failed: " + (err.message || "Unknown error")); } setSyncingPush(false); };
  const testScriptUrl = async () => { const url = settings.google_apps_script_url; if (!url) { toast.error("No Apps Script URL configured"); return; } setTestingScriptUrl(true); try { const today = format(new Date(), "yyyy-MM-dd"); const { data, error } = await supabase.functions.invoke("sync-to-sheet", { body: { date: today } }); if (error) throw error; if (data?.success) { toast.success("✅ Apps Script URL is working! Data synced to sheet.", { duration: 6000 }); } else { const errDetail = data?.errors?.join(" | ") || data?.error || "No response from Apps Script"; toast.error(`Apps Script test failed: ${errDetail}`, { duration: 12000 }); } } catch (err: any) { toast.error("Apps Script URL failed: " + (err.message || "Could not reach edge function")); } setTestingScriptUrl(false); };
  const lastSyncAt = settings.last_sync_at;

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="container mx-auto px-4 py-8">
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
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove User</AlertDialogTitle><AlertDialogDescription>Permanently remove <strong>{deleteTarget?.full_name}</strong>?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={!!deletingDataset} onOpenChange={(open) => { if (!open) setDeletingDataset(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Dataset</AlertDialogTitle><AlertDialogDescription>Delete <strong>"{deletingDataset?.name}"</strong> and all its student records?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteDataset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Dataset</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <Dialog open={addDatasetOpen} onOpenChange={(open) => { setAddDatasetOpen(open); if (!open) { setEditDataset(null); setNewDatasetName(""); setNewDatasetUrl(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editDataset ? "Edit Dataset" : "Add New Dataset"}</DialogTitle><DialogDescription>{editDataset ? "Update the name or CSV URL." : "Add a new student sheet tab."}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Dataset Name <span className="text-destructive">*</span></Label><Input placeholder="e.g. Master List Adilabad" value={newDatasetName} onChange={(e) => setNewDatasetName(e.target.value)} />{newDatasetName && <p className="text-xs text-muted-foreground">Internal ID: <code className="bg-muted px-1 rounded">{toSlug(newDatasetName)}</code></p>}</div>
            <div className="space-y-2"><Label>Google Sheet CSV URL</Label><Input placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&output=csv" value={newDatasetUrl} onChange={(e) => setNewDatasetUrl(e.target.value)} className="text-xs" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => { setAddDatasetOpen(false); setEditDataset(null); }}>Cancel</Button><Button onClick={saveDataset} disabled={savingDataset || !newDatasetName.trim()}>{savingDataset ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Saving...</> : (editDataset ? "Save Changes" : "Add Dataset")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {tab === "datasets" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between"><div><h3 className="text-lg font-bold text-foreground">Student Datasets</h3><p className="text-sm text-muted-foreground mt-0.5">Switch active dataset to change which students the website shows.</p></div><Button onClick={() => setAddDatasetOpen(true)} className="gap-1.5 shrink-0"><Plus className="h-4 w-4" /> Add New Dataset</Button></div>
          {activeDataset && <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-300 px-4 py-3 text-sm text-green-800"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /><span>Currently showing: <strong>{activeDataset.name}</strong></span></div>}
          <div className="space-y-3">
            {datasets.map((ds) => {
              const isActive = ds.is_active; const isSyncing = syncingDataset === ds.slug; const isSwitching = switchingDataset === ds.slug; const isTesting = testingUrl === ds.slug; const hasUrl = !!ds.sheet_url?.trim();
              return (
                <div key={ds.id} className={`rounded-xl border-2 p-5 transition-all ${isActive ? "border-green-400 bg-green-50/60 shadow-sm" : "border-border bg-card hover:border-muted-foreground/30"}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="mt-0.5">{isActive ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><span className={`font-bold text-base ${isActive ? "text-green-800" : "text-foreground"}`}>{ds.name}</span>{isActive && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">● ACTIVE</span>}<span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">{ds.slug}</span></div>
                      {hasUrl ? <p className="text-xs text-muted-foreground mt-1 truncate max-w-xl">{ds.sheet_url.slice(0, 80)}...</p> : <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><Info className="h-3.5 w-3.5" /> No CSV URL — click Edit</p>}
                      {ds.updated_at && <p className="text-xs text-muted-foreground mt-0.5">Last synced: {format(new Date(ds.updated_at), "dd MMM yyyy, hh:mm a")}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {hasUrl && <Button variant="outline" size="sm" onClick={() => testDatasetUrl(ds.slug, ds.sheet_url)} disabled={isTesting} className="gap-1 h-8 text-xs">{isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Test URL</Button>}
                      <Button variant="outline" size="sm" onClick={() => syncDataset(ds.slug)} disabled={isSyncing || !hasUrl} className="gap-1 h-8 text-xs">{isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{isSyncing ? "Syncing..." : "Sync from Sheet"}</Button>
                      {!isActive && <Button size="sm" onClick={() => switchDataset(ds.slug)} disabled={!!switchingDataset} className="gap-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white">{isSwitching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{isSwitching ? "Switching..." : "Set Active"}</Button>}
                      <Button variant="outline" size="sm" onClick={() => openEdit(ds)} className="gap-1 h-8 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      {!isActive && <Button variant="outline" size="sm" onClick={() => setDeletingDataset(ds)} className="gap-1 h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-border p-5">
            <div className="flex items-center gap-2 mb-3"><ArrowUpToLine className="h-4 w-4 text-primary" /><h4 className="font-semibold text-foreground text-sm">Push Today's Attendance → Google Sheet</h4></div>
            {lastSyncAt && <p className="text-xs text-muted-foreground mb-3">Last sync: {format(new Date(lastSyncAt), "dd MMM yyyy, hh:mm a")}</p>}
            <Button onClick={handlePushSync} disabled={syncingPush} variant="outline" className="gap-1.5">{syncingPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpToLine className="h-4 w-4" />}Push Today's Attendance to Sheet</Button>
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
            <div className="flex items-center gap-2 mb-4"><ArrowUpToLine className="h-5 w-5 text-primary" /><h3 className="text-base font-bold">Attendance Sync (Website → Google Sheet)</h3></div>
            <div className="space-y-2"><Label>Apps Script Web App URL</Label><div className="flex gap-2"><Input value={settings.google_apps_script_url ?? ""} onChange={(e) => setSettings(prev => ({ ...prev, google_apps_script_url: e.target.value }))} placeholder="https://script.google.com/macros/s/.../exec" className="text-sm flex-1" /><Button variant="outline" size="sm" onClick={testScriptUrl} disabled={testingScriptUrl}>{testingScriptUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}</Button></div></div>
          </div>
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
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
