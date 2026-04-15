import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Search, Package, BarChart3, Pencil, Save, Copy, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";

type InventoryItem = {
  id: string; item_name: string; category: string; sub_category: string; grade: string;
  total_received: number; distributed: number; extra: number;
  dataset: string; created_at: string; updated_at: string;
};

const Inventory = () => {
  const { userRole } = useAuth();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = userRole === "owner";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [dirtyRows, setDirtyRows] = useState<Record<string, Partial<InventoryItem>>>({});
  const [saving, setSaving] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchQuery), 300); return () => clearTimeout(t); }, [searchQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("inventory_items").select("*").order("category").order("item_name");
      setItems((data as any[]) ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return items;
    const q = debouncedSearch.toLowerCase();
    return items.filter(i => i.item_name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || (i.grade ?? "").toLowerCase().includes(q));
  }, [items, debouncedSearch]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(item => {
      const cat = item.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    });
    return map;
  }, [filtered]);

  const totalReceived = items.reduce((s, i) => s + i.total_received, 0);
  const totalDistributed = items.reduce((s, i) => s + i.distributed, 0);
  const totalAvailable = items.reduce((s, i) => s + Math.max(0, i.total_received - i.distributed + i.extra), 0);
  const lastUpdated = items.length > 0 ? items.reduce((max, i) => i.updated_at > max ? i.updated_at : max, items[0].updated_at) : null;

  const getAvailable = (item: InventoryItem) => {
    const dirty = dirtyRows[item.id];
    const tr = dirty?.total_received ?? item.total_received;
    const dist = dirty?.distributed ?? item.distributed;
    const ext = dirty?.extra ?? item.extra;
    return tr - dist + ext;
  };

  const handleFieldChange = (id: string, field: string, value: number) => {
    setDirtyRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSaveAll = async () => {
    const changedIds = Object.keys(dirtyRows);
    if (changedIds.length === 0) { toast.info("No changes to save"); return; }
    setSaving(true);
    try {
      const changes: any[] = [];
      for (const id of changedIds) {
        const dirty = dirtyRows[id];
        const original = items.find(i => i.id === id);
        if (!original) continue;
        const updates: any = { updated_at: new Date().toISOString(), updated_by: user?.id };
        if (dirty.total_received !== undefined) updates.total_received = dirty.total_received;
        if (dirty.distributed !== undefined) updates.distributed = dirty.distributed;
        if (dirty.extra !== undefined) updates.extra = dirty.extra;
        await supabase.from("inventory_items").update(updates as any).eq("id", id);
        changes.push({ item: original.item_name, old: { total_received: original.total_received, distributed: original.distributed, extra: original.extra }, new: updates });
      }
      // Log activity
      await supabase.from("activity_logs").insert({
        user_id: user?.id, action: "inventory_update", entity_type: "inventory",
        details: { changes },
      } as any);
      toast.success(`Saved ${changedIds.length} item(s)`);
      setDirtyRows({});
      setEditMode(false);
      fetchData();
    } catch (err: any) { toast.error("Save failed: " + err.message); }
    setSaving(false);
  };

  // Availability report text
  const reportText = useMemo(() => {
    const date = format(new Date(), "dd MMM yyyy");
    const available = items.filter(i => (i.total_received - i.distributed + i.extra) > 0);
    const outOfStock = items.filter(i => (i.total_received - i.distributed + i.extra) <= 0);
    let text = `📦 Inventory Availability Report — ${date}\n\n`;
    if (available.length > 0) {
      text += `✅ AVAILABLE ITEMS:\n`;
      available.forEach(i => {
        const avail = i.total_received - i.distributed + i.extra;
        text += `• ${i.item_name}${i.grade ? ` ${i.grade}` : ""}: ${avail} available (${i.total_received} received, ${i.distributed} distributed)\n`;
      });
    }
    if (outOfStock.length > 0) {
      text += `\n❌ OUT OF STOCK:\n`;
      outOfStock.forEach(i => { text += `• ${i.item_name}${i.grade ? ` ${i.grade}` : ""}: 0 available\n`; });
    }
    text += `\n📊 TOTAL: ${items.length} items tracked, ${totalDistributed} distributed, ${totalAvailable} available`;
    return text;
  }, [items, totalDistributed, totalAvailable]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2"><Package className="h-6 w-6 text-primary" /><h2 className="text-2xl font-bold text-foreground">Inventory Dashboard</h2></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdated && <span className="text-xs text-muted-foreground">Updated: {format(new Date(lastUpdated), "dd MMM, hh:mm a")}</span>}
          <Button variant="outline" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <Button variant="outline" onClick={() => setReportOpen(true)} className="gap-1.5"><Send className="h-4 w-4" /> Availability Report</Button>
          {isOwner && !editMode && <Button onClick={() => setEditMode(true)} className="gap-1.5"><Pencil className="h-4 w-4" /> Edit Inventory</Button>}
          {editMode && <Button onClick={handleSaveAll} disabled={saving} className="gap-1.5"><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}</Button>}
          {editMode && <Button variant="outline" onClick={() => { setEditMode(false); setDirtyRows({}); }}>Cancel</Button>}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "ITEM CATEGORIES", value: new Set(items.map(i => i.category)).size, icon: BarChart3 },
          { label: "TOTAL RECEIVED", value: totalReceived },
          { label: "DISTRIBUTED", value: totalDistributed },
          { label: "AVAILABLE", value: totalAvailable, color: totalAvailable > 0 ? "text-green-500" : "text-destructive" },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color || "text-foreground"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50">
              <th className="px-3 py-2.5 text-left font-semibold">CATEGORY</th>
              <th className="px-3 py-2.5 text-left font-semibold">SUB-ITEM</th>
              <th className="px-3 py-2.5 text-left font-semibold">GRADE/TYPE</th>
              <th className="px-3 py-2.5 text-center font-semibold">TOTAL RECEIVED</th>
              <th className="px-3 py-2.5 text-center font-semibold">DISTRIBUTED</th>
              <th className="px-3 py-2.5 text-center font-semibold">EXTRA</th>
              <th className="px-3 py-2.5 text-center font-semibold">AVAILABLE</th>
            </tr></thead>
            <tbody>
              {Array.from(grouped.entries()).map(([category, catItems]) => (
                <>
                  <tr key={`cat-${category}`} className="bg-primary/5">
                    <td colSpan={7} className="px-3 py-2 font-bold text-primary text-sm">{category} ({catItems.length})</td>
                  </tr>
                  {catItems.map((item, i) => {
                    const available = getAvailable(item);
                    const dirty = dirtyRows[item.id];
                    return (
                      <tr key={item.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                        <td className="px-3 py-2.5 font-medium">{item.item_name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.sub_category || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.grade || "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.total_received ?? item.total_received} onChange={e => handleFieldChange(item.id, "total_received", parseInt(e.target.value) || 0)} /> : item.total_received}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.distributed ?? item.distributed} onChange={e => handleFieldChange(item.id, "distributed", parseInt(e.target.value) || 0)} /> : item.distributed}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {editMode ? <Input type="number" className="w-20 h-7 text-center mx-auto" value={dirty?.extra ?? item.extra} onChange={e => handleFieldChange(item.id, "extra", parseInt(e.target.value) || 0)} /> : item.extra}
                        </td>
                        <td className={`px-3 py-2.5 text-center font-bold ${available > 0 ? "text-green-500" : "text-destructive"}`}>{available}</td>
                      </tr>
                    );
                  })}
                </>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No inventory items found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

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
