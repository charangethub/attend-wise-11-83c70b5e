import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, RefreshCw, Search, Eye, Package, AlertTriangle, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type InventoryItem = {
  id: string; item_name: string; zone: string; centre: string; grade: string; size: string;
  ytd_received: number; current_stock: number; damaged: number; missing: number; reserved: number;
  dataset: string; created_at: string; updated_at: string;
};
type ActivityLog = { id: string; item_name: string; action: string; quantity_change: number; changed_by_name: string; notes: string; created_at: string };

const Inventory = () => {
  const { userRole } = useAuth();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdminOrOwner = userRole === "owner" || userRole === "admin";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stock" | "log">("stock");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // Add stock form
  const [newName, setNewName] = useState("");
  const [newZone, setNewZone] = useState("");
  const [newCentre, setNewCentre] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newQty, setNewQty] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: itemData }, { data: logData }] = await Promise.all([
        supabase.from("inventory_items" as any).select("*").order("item_name"),
        supabase.from("inventory_activity_logs" as any).select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      setItems((itemData as any[]) ?? []);
      setLogs((logData as any[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return items;
    const q = debouncedSearch.toLowerCase();
    return items.filter(i => i.item_name.toLowerCase().includes(q) || i.grade.toLowerCase().includes(q));
  }, [items, debouncedSearch]);

  const totalItems = items.length;
  const totalStock = items.reduce((s, i) => s + i.current_stock, 0);
  const totalAvailable = items.reduce((s, i) => s + Math.max(0, i.current_stock - i.damaged - i.missing - i.reserved), 0);
  const totalDamaged = items.reduce((s, i) => s + i.damaged, 0);
  const criticalCount = items.filter(i => (i.current_stock - i.damaged - i.missing - i.reserved) <= 0).length;

  const handleAdd = async () => {
    if (!newName.trim()) { toast.error("Enter item name"); return; }
    setSaving(true);
    try {
      const qty = parseInt(newQty) || 0;
      const { error } = await supabase.from("inventory_items" as any).insert({
        item_name: newName.trim(), zone: newZone.trim(), centre: newCentre.trim(),
        grade: newGrade.trim(), size: newSize.trim(), ytd_received: qty, current_stock: qty,
      } as any);
      if (error) throw error;

      await supabase.from("inventory_activity_logs" as any).insert({
        item_name: newName.trim(), action: "Added",
        quantity_change: qty, changed_by: user?.id,
        changed_by_name: user?.user_metadata?.full_name ?? user?.email ?? "",
        notes: "Initial stock entry",
      } as any);

      toast.success("Item added!");
      setAddOpen(false);
      setNewName(""); setNewZone(""); setNewCentre(""); setNewGrade(""); setNewSize(""); setNewQty("0");
      void fetchData();
    } catch (e: any) {
      toast.error("Failed: " + (e.message || "Unknown error"));
    } finally {
      setSaving(false);
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
            <h2 className="text-2xl font-bold text-foreground">Inventory Dashboard</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdminOrOwner && (
            <Button onClick={() => setAddOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Add Stock</Button>
          )}
          <Button variant="outline" onClick={fetchData} className="gap-1.5"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "TOTAL ITEMS", value: totalItems, icon: BarChart3 },
          { label: "TOTAL STOCK", value: totalStock },
          { label: "AVAILABLE", value: totalAvailable, color: "text-success" },
          { label: "DAMAGED", value: totalDamaged, color: "text-destructive" },
          { label: "CRITICAL ITEMS", value: criticalCount, color: "text-destructive" },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color || "text-foreground"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant={tab === "stock" ? "default" : "outline"} size="sm" onClick={() => setTab("stock")}>Stock Overview</Button>
        <Button variant={tab === "log" ? "default" : "outline"} size="sm" onClick={() => setTab("log")}>Activity Log ({logs.length})</Button>
      </div>

      {tab === "stock" && (
        <>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by item or grade..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : (
            <div className="rounded-lg border border-border overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50">
                  <th className="px-3 py-2.5 text-left font-semibold">ITEM</th>
                  <th className="px-3 py-2.5 text-left font-semibold">ZONE</th>
                  <th className="px-3 py-2.5 text-left font-semibold">CENTRE</th>
                  <th className="px-3 py-2.5 text-left font-semibold">GRADE</th>
                  <th className="px-3 py-2.5 text-left font-semibold">SIZE</th>
                  <th className="px-3 py-2.5 text-center font-semibold">YTD RECEIVED</th>
                  <th className="px-3 py-2.5 text-center font-semibold">CURRENT STOCK</th>
                  <th className="px-3 py-2.5 text-center font-semibold">DAMAGED</th>
                  <th className="px-3 py-2.5 text-center font-semibold">MISSING</th>
                  <th className="px-3 py-2.5 text-center font-semibold">RESERVED</th>
                  <th className="px-3 py-2.5 text-center font-semibold">AVAILABLE</th>
                  <th className="px-3 py-2.5 text-center font-semibold">STATUS</th>
                  <th className="px-3 py-2.5 text-center font-semibold">ACTIONS</th>
                </tr></thead>
                <tbody>
                  {filtered.map((item, i) => {
                    const available = item.current_stock - item.damaged - item.missing - item.reserved;
                    const isCritical = available <= 0;
                    return (
                      <tr key={item.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                        <td className="px-3 py-2.5 font-medium">{item.item_name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.zone || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.centre || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.grade || "-"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{item.size || "—"}</td>
                        <td className="px-3 py-2.5 text-center">{item.ytd_received}</td>
                        <td className="px-3 py-2.5 text-center">{item.current_stock}</td>
                        <td className="px-3 py-2.5 text-center">{item.damaged}</td>
                        <td className="px-3 py-2.5 text-center">{item.missing}</td>
                        <td className="px-3 py-2.5 text-center">{item.reserved}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-primary">{available}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isCritical ? "bg-destructive text-destructive-foreground" : "bg-success text-success-foreground"}`}>
                            {isCritical ? "CRITICAL" : "OK"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0"><Eye className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "log" && (
        <div className="rounded-lg border border-border overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50">
              <th className="px-4 py-2.5 text-left font-semibold">Timestamp</th>
              <th className="px-4 py-2.5 text-left font-semibold">Item</th>
              <th className="px-4 py-2.5 text-left font-semibold">Action</th>
              <th className="px-4 py-2.5 text-center font-semibold">Qty Change</th>
              <th className="px-4 py-2.5 text-left font-semibold">Changed By</th>
              <th className="px-4 py-2.5 text-left font-semibold">Notes</th>
            </tr></thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{format(new Date(log.created_at), "dd MMM yyyy, hh:mm a")}</td>
                  <td className="px-4 py-2.5 font-medium">{log.item_name}</td>
                  <td className="px-4 py-2.5">{log.action}</td>
                  <td className="px-4 py-2.5 text-center font-bold">{log.quantity_change > 0 ? `+${log.quantity_change}` : log.quantity_change}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{log.changed_by_name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.notes || "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No activity logged yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Stock Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Stock Item</DialogTitle>
            <DialogDescription>Add a new item to the inventory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Item Name *</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Tatva, Clicker..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Zone</Label><Input value={newZone} onChange={e => setNewZone(e.target.value)} placeholder="e.g. AP" /></div>
              <div><Label>Centre</Label><Input value={newCentre} onChange={e => setNewCentre(e.target.value)} placeholder="e.g. Tirupati" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Grade</Label><Input value={newGrade} onChange={e => setNewGrade(e.target.value)} placeholder="e.g. 11 JEE" /></div>
              <div><Label>Size</Label><Input value={newSize} onChange={e => setNewSize(e.target.value)} placeholder="Optional" /></div>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={newQty} onChange={e => setNewQty(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Adding..." : "Add Item"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inventory;
