import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, PackageSearch } from "lucide-react";
import dayjs from "dayjs";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColor = { draft: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300", sent: "bg-blue-500/15 text-blue-600 dark:text-blue-400", received: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };

export default function Suppliers() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [poOpen, setPoOpen] = useState(false);
  const [poSupplier, setPoSupplier] = useState("");
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api.get("/suppliers").then((r) => r.data) });
  const { data: suggestions = [] } = useQuery({ queryKey: ["reorder"], queryFn: () => api.get("/suppliers/reorder-suggestions").then((r) => r.data) });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: () => api.get("/suppliers/orders").then((r) => r.data) });

  const addSupplier = async (e) => {
    e.preventDefault();
    try {
      await api.post("/suppliers", form);
      toast.success(`${form.name} added`);
      setOpen(false); setForm({ name: "", phone: "", address: "" });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (err) { toast.error(errMsg(err)); }
  };

  const createPO = async () => {
    try {
      await api.post("/suppliers/orders", {
        supplier_id: poSupplier,
        items: suggestions.map((s) => ({ product_id: s.product_id, name: s.name, qty: s.suggested_qty })),
      });
      toast.success(`${t("createPO")} ✓`);
      setPoOpen(false);
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) { toast.error(errMsg(err)); }
  };

  const setStatus = async (oid, status) => {
    try {
      await api.patch(`/suppliers/orders/${oid}/status`, { status });
      toast.success(`${t(status)} ✓`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["reorder"] });
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div data-testid="suppliers-page" className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("suppliers")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-supplier-btn" className="h-12 gap-2 active:scale-95 transition-transform duration-100"><Plus size={18} />{t("addSupplier")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-heading">{t("addSupplier")}</DialogTitle></DialogHeader>
            <form onSubmit={addSupplier} className="space-y-3">
              <div className="space-y-1.5"><Label>{t("name")}</Label><Input data-testid="supplier-name-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-12" /></div>
              <div className="space-y-1.5"><Label>{t("phone")}</Label><Input data-testid="supplier-phone-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-12" /></div>
              <div className="space-y-1.5"><Label>{t("address")}</Label><Input data-testid="supplier-address-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="h-12" /></div>
              <Button data-testid="supplier-save-btn" className="w-full h-12">{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reorder suggestions */}
      <div className="border rounded-md bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground flex items-center gap-2"><PackageSearch size={16} /> {t("reorderSuggestions")}</h2>
          {suggestions.length > 0 && (
            <Dialog open={poOpen} onOpenChange={setPoOpen}>
              <DialogTrigger asChild><Button data-testid="create-po-btn" size="sm" className="active:scale-95 transition-transform duration-100">{t("createPO")}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-heading">{t("createPO")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Select value={poSupplier} onValueChange={setPoSupplier}>
                    <SelectTrigger data-testid="po-supplier-select" className="h-12"><SelectValue placeholder={t("suppliers")} /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="text-sm space-y-1">{suggestions.map((s) => <p key={s.product_id}>{s.name} — {t("qty")} {s.suggested_qty}</p>)}</div>
                  <Button data-testid="po-create-confirm-btn" disabled={!poSupplier} onClick={createPO} className="w-full h-12">{t("save")}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        {suggestions.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
        {suggestions.map((s) => (
          <div key={s.product_id} data-testid={`reorder-row-${s.product_id}`} className="flex justify-between text-sm py-1">
            <span>{s.name} <span className="text-red-500 font-semibold">({s.stock} left)</span></span>
            <span className="text-muted-foreground">{t("suggestedQty")}: {s.suggested_qty}</span>
          </div>
        ))}
      </div>

      {/* Suppliers list */}
      {suppliers.length === 0 && <p data-testid="no-suppliers-msg" className="text-muted-foreground text-sm text-center">{t("noSuppliers")}</p>}
      {suppliers.length > 0 && (
        <div className="border rounded-md bg-card divide-y">
          {suppliers.map((s) => (
            <div key={s.id} data-testid={`supplier-row-${s.id}`} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{[s.phone, s.address].filter(Boolean).join(" · ")}</p>
              </div>
              <button data-testid={`delete-supplier-btn-${s.id}`} onClick={async () => { if (window.confirm(`Delete ${s.name}?`)) { await api.delete(`/suppliers/${s.id}`); qc.invalidateQueries({ queryKey: ["suppliers"] }); } }} className="p-2 rounded-md hover:bg-accent text-muted-foreground"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Purchase orders */}
      <div>
        <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground mb-3">{t("purchaseOrders")}</h2>
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} data-testid={`po-row-${o.id}`} className="border rounded-md bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium">{o.supplier_name}</p>
                <span data-testid={`po-status-${o.id}`} className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColor[o.status]}`}>{t(o.status)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{dayjs(o.created_at).format("DD MMM YYYY")} · {o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}</p>
              <div className="flex gap-2">
                {o.status === "draft" && <Button data-testid={`po-mark-sent-${o.id}`} size="sm" variant="outline" onClick={() => setStatus(o.id, "sent")} className="active:scale-95 transition-transform duration-100">{t("markSent")}</Button>}
                {o.status === "sent" && <Button data-testid={`po-mark-received-${o.id}`} size="sm" onClick={() => setStatus(o.id, "received")} className="active:scale-95 transition-transform duration-100">{t("markReceived")}</Button>}
              </div>
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
        </div>
      </div>
    </div>
  );
}
