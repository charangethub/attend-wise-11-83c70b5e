import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Search, Package, BarChart3, Pencil, Save, Copy, Send, Plus, Eye, Upload, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CsvUploadDialog from "@/components/CsvUploadDialog";
import { parseCsv, normalizeHeader } from "@/lib/csvParse";

type InventoryItem = {
  id: string; item_name: string; category: string; sub_category: string; grade: string;
  zone: string; centre: string; size: string;
  total_received: number; distributed: number; extra: number;
  ytd_received: number; current_stock: number; damaged: number; missing: number; reserved: number;
  dataset: string; created_at: string; updated_at: string;
};

type ActivityLog = {
  id: string; action: string; item_name: string; quantity_change: number;
  changed_by_name: string; notes: string; created_at: string;
};

const Inventory = () => {
  const { userRole, user } = useAuth();
  const navigate = useNavigate();
  const isOwner = userRole === "owner";
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [dirtyRows, setDirtyRows] = useState<Record<string, Partial<InventoryItem>>>({});
  const [saving, setSaving] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addingStock, setAddingStock] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [activeTab, setActiveTab] = useState("stock");

  // Add stock form
  const [newItem, setNewItem] = useState({ item_name: "", zone: "", centre: "", grade: "", size: "", ytd_received: 0, current_stock: 0 });

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchQuery), 300); return () => clearTimeout(t); }, [searchQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("inventory_items").select("*").order("item_name");
      setItems((data as any[]) ?? []);
    } finally { setLoading(false); }
  }, []);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase.from("inventory_activity_logs").select("*").order("created_at", { ascending: false }).limit(100);
    setActivityLogs((data as any[]) ?? []);
  }, []);

  useEffect(() => { void fetchData(); void fetchLogs(); }, [fetchData, fetchLogs]);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return items;
    const q = debouncedSearch.toLowerCase();
    return items.filter(i => i.item_name.toLowerCase().includes(q) || (i.grade ?? "").toLowerCase().includes(q) || (i.zone ?? "").toLowerCase().includes(q));
  }, [items, debouncedSearch]);

  const totalStock = items.reduce((s, i) => s + (i.current_stock ?? i.ytd_received ?? 0), 0);
  const totalAvailable = items.reduce((s, i) => s + Math.max(0, (i.current_stock ?? 0) - (i.damaged ?? 0) - (i.missing ?? 0) - (i.reserved ?? 0)), 0);
  const totalDamaged = items.reduce((s, i) => s + (i.damaged ?? 0), 0);
  const criticalItems = items.filter(i => {
    const avail = (i.current_stock ?? 0) - (i.damaged ?? 0) - (i.missing ?? 0) - (i.reserved ?? 0);
    return avail <= 0;
  }).length;

  const handleAddStock = async () => {
    if (!newItem.item_name.trim()) { toast.error("Item name is required"); return; }
    setAddingStock(true);
    try {
      const { error } = await supabase.from("inventory_items").insert({
        item_name: newItem.item_name.trim(),
        zone: newItem.zone.trim(),
        centre: newItem.centre.trim(),
        grade: newItem.grade.trim(),
        size: newItem.size.trim(),
        ytd_received: newItem.ytd_received,
        current_stock: newItem.current_stock,
        total_received: newItem.ytd_received,
        category: newItem.item_name.trim(),
      } as any);
      if (error) throw error;

      // Log activity
      await supabase.from("inventory_activity_logs").insert({
        action: "stock_added",
        item_name: newItem.item_name.trim(),
        quantity_change: newItem.current_stock,
        changed_by: user?.id,
        changed_by_name: "",
        notes: `Added new stock: ${newItem.item_name} (${newItem.current_stock} units)`,
      } as any);

      toast.success("Stock item added successfully");
      setAddStockOpen(false);
      setNewItem({ item_name: "", zone: "", centre: "", grade: "", size: "", ytd_received: 0, current_stock: 0 });
      fetchData();
      fetchLogs();
    } catch (err: any) { toast.error("Failed to add stock: " + err.message); }
    setAddingStock(false);
  };

  const handleFieldChange = (id: string, field: string, value: number) => {
    setDirtyRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSaveAll = async () => {
    const changedIds = Object.keys(dirtyRows);
    if (changedIds.length === 0) { toast.info("No changes to save"); return; }
    setSaving(true);
    try {
      for (const id of changedIds) {
        const dirty = dirtyRows[id];
        const original = items.find(i => i.id === id);
        if (!original) continue;
        const updates: any = { updated_at: new Date().toISOString(), updated_by: user?.id };
        if (dirty.ytd_received !== undefined) updates.ytd_received = dirty.ytd_received;
        if (dirty.current_stock !== undefined) updates.current_stock = dirty.current_stock;
        if (dirty.damaged !== undefined) updates.damaged = dirty.damaged;
        if (dirty.missing !== undefined) updates.missing = dirty.missing;
        if (dirty.reserved !== undefined) updates.reserved = dirty.reserved;
        await supabase.from("inventory_items").update(updates as any).eq("id", id);

        await supabase.from("inventory_activity_logs").insert({
          action: "stock_updated",
          item_id: id,
          item_name: original.item_name,
          changed_by: user?.id,
          notes: `Updated: ${JSON.stringify(updates)}`,
        } as any);
      }
      toast.success(`Saved ${changedIds.length} item(s)`);
      setDirtyRows({});
      setEditMode(false);
      fetchData();
      fetchLogs();
    } catch (err: any) { toast.error("Save failed: " + err.message); }
    setSaving(false);
  };

  const getAvailable = (item: InventoryItem) => {
    const dirty = dirtyRows[item.id];
    const stock = dirty?.current_stock ?? item.current_stock ?? 0;
    const dmg = dirty?.damaged ?? item.damaged ?? 0;
    const miss = dirty?.missing ?? item.missing ?? 0;
    const res = dirty?.reserved ?? item.reserved ?? 0;
    return stock - dmg - miss - res;
  };

  const reportText = useMemo(() => {
    const date = format(new Date(), "dd MMM yyyy");
    let text = `📦 Inventory Availability Report — ${date}\n\n`;
    const available = items.filter(i => getAvailable(i) > 0);
    const outOfStock = items.filter(i => getAvailable(i) <= 0);
    if (available.length > 0) {
      text += `✅ AVAILABLE ITEMS:\n`;
      available.forEach(i => {
        text += `• ${i.item_name}${i.grade ? ` ${i.grade}` : ""}: ${getAvailable(i)} available\n`;
      });
    }
    if (outOfStock.length > 0) {
      text += `\n❌ OUT OF STOCK:\n`;
      outOfStock.forEach(i => { text += `• ${i.item_name}${i.grade ? ` ${i.grade}` : ""}\n`; });
    }
    text += `\n📊 TOTAL: ${items.length} items, ${totalStock} stock, ${totalAvailable} available`;
    return text;
  }, [items, totalStock, totalAvailable]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2"><Package className="h-6 w-6 text-primary" /><h2 className="text-2xl font-bold text-foreground">Inventory Dashboard</h2></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdminOrOwner && <Button onClick={() => setAddStockOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add Stock</Button>}
          {isOwner && <Button variant="outline" onClick={() => setCsvOpen(true)} className="gap-1.5"><Upload className="h-4 w-4" /> Upload CSV</Button>}
          <Button variant="outline" onClick={() => { fetchData(); fetchLogs(); }} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "TOTAL ITEMS", value: items.length, icon: BarChart3 },
          { label: "TOTAL STOCK", value: totalStock },
          { label: "AVAILABLE", value: totalAvailable, color: "text-green-500" },
          { label: "DAMAGED", value: totalDamaged, color: totalDamaged > 0 ? "text-destructive" : undefined },
          { label: "CRITICAL ITEMS", value: criticalItems, color: criticalItems > 0 ? "text-destructive" : undefined },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color || "text-foreground"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="stock">Stock Overview</TabsTrigger>
          <TabsTrigger value="log">Activity Log ({activityLogs.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "stock" && (
        <>
          {/* Search & Edit */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by item or grade..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setReportOpen(true)} className="gap-1.5"><Send className="h-4 w-4" /> Report</Button>
              {isOwner && !editMode && <Button size="sm" onClick={() => setEditMode(true)} className="gap-1.5"><Pencil className="h-4 w-4" /> Edit</Button>}
              {editMode && <Button size="sm" onClick={handleSaveAll} disabled={saving} className="gap-1.5"><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}</Button>}
              {editMode && <Button variant="outline" size="sm" onClick={() => { setEditMode(false); setDirtyRows({}); }}>Cancel</Button>}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : (
            <div className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/80 backdrop-blur">
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">ITEM</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">ZONE</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">CENTRE</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">GRADE</th>
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">SIZE</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">YTD RECEIVED</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">CURRENT STOCK</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">DAMAGED</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">MISSING</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">RESERVED</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">AVAILABLE</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">STATUS</th>
                    <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => {
                    const available = getAvailable(item);
                    const dirty = dirtyRows[item.id];
                    return (
                      <tr key={item.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{item.item_name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.zone || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.centre || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.grade || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.size || "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.ytd_received ?? item.ytd_received ?? 0} onChange={e => handleFieldChange(item.id, "ytd_received", parseInt(e.target.value) || 0)} /> : (item.ytd_received ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.current_stock ?? item.current_stock ?? 0} onChange={e => handleFieldChange(item.id, "current_stock", parseInt(e.target.value) || 0)} /> : (item.current_stock ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.damaged ?? item.damaged ?? 0} onChange={e => handleFieldChange(item.id, "damaged", parseInt(e.target.value) || 0)} /> : (item.damaged ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.missing ?? item.missing ?? 0} onChange={e => handleFieldChange(item.id, "missing", parseInt(e.target.value) || 0)} /> : (item.missing ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.reserved ?? item.reserved ?? 0} onChange={e => handleFieldChange(item.id, "reserved", parseInt(e.target.value) || 0)} /> : (item.reserved ?? 0)}
                        </td>
                        <td className={`px-3 py-2.5 text-center font-bold ${available > 0 ? "text-green-500" : "text-destructive"}`}>{available}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${available > 0 ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>
                            {available > 0 ? "OK" : "LOW"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => setDetailItem(item)} className="rounded p-1 hover:bg-muted transition-colors"><Eye className="h-4 w-4 text-muted-foreground" /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">No inventory items found</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === "log" && (
        <div className="rounded-lg border border-border overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/80 backdrop-blur">
                <th className="px-3 py-2 text-left font-semibold">Time</th>
                <th className="px-3 py-2 text-left font-semibold">Action</th>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-left font-semibold">Qty Change</th>
                <th className="px-3 py-2 text-left font-semibold">By</th>
                <th className="px-3 py-2 text-left font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {activityLogs.map((log, i) => (
                <tr key={log.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(log.created_at), "dd MMM, hh:mm a")}</td>
                  <td className="px-3 py-2 text-xs font-medium">{log.action}</td>
                  <td className="px-3 py-2 text-xs">{log.item_name || "—"}</td>
                  <td className="px-3 py-2 text-xs">{log.quantity_change ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{log.changed_by_name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{log.notes || "—"}</td>
                </tr>
              ))}
              {activityLogs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No activity logs yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Stock Dialog */}
      <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add New Stock Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Item Name *</Label><Input value={newItem.item_name} onChange={e => setNewItem(p => ({ ...p, item_name: e.target.value }))} placeholder="e.g. VDPP" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Zone</Label><Input value={newItem.zone} onChange={e => setNewItem(p => ({ ...p, zone: e.target.value }))} placeholder="e.g. TS" /></div>
              <div><Label>Centre</Label><Input value={newItem.centre} onChange={e => setNewItem(p => ({ ...p, centre: e.target.value }))} placeholder="e.g. ADILABAD" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Grade</Label><Input value={newItem.grade} onChange={e => setNewItem(p => ({ ...p, grade: e.target.value }))} placeholder="e.g. 11-JEE-A" /></div>
              <div><Label>Size</Label><Input value={newItem.size} onChange={e => setNewItem(p => ({ ...p, size: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>YTD Received</Label><Input type="number" value={newItem.ytd_received} onChange={e => setNewItem(p => ({ ...p, ytd_received: parseInt(e.target.value) || 0 }))} /></div>
              <div><Label>Current Stock</Label><Input type="number" value={newItem.current_stock} onChange={e => setNewItem(p => ({ ...p, current_stock: parseInt(e.target.value) || 0 }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddStock} disabled={addingStock} className="w-full">{addingStock ? "Adding..." : "Add Stock Item"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Detail Dialog */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{detailItem?.item_name}</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-2 text-sm">
              {[
                ["Zone", detailItem.zone], ["Centre", detailItem.centre], ["Grade", detailItem.grade], ["Size", detailItem.size],
                ["YTD Received", detailItem.ytd_received], ["Current Stock", detailItem.current_stock],
                ["Damaged", detailItem.damaged], ["Missing", detailItem.missing], ["Reserved", detailItem.reserved],
                ["Available", getAvailable(detailItem)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between"><span className="text-muted-foreground">{k}:</span><span className="font-medium">{v || "—"}</span></div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Availability Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Availability Report</DialogTitle><DialogDescription>Copy and share this summary.</DialogDescription></DialogHeader>
          <pre className="whitespace-pre-wrap text-xs bg-muted p-4 rounded-lg max-h-80 overflow-auto font-mono">{reportText}</pre>
          <DialogFooter>
            <Button onClick={() => { navigator.clipboard.writeText(reportText); toast.success("Copied!"); }} className="gap-1.5"><Copy className="h-4 w-4" /> Copy to Clipboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
