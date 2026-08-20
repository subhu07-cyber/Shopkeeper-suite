import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ScanLine, Pencil, Trash2, Loader2, ShoppingCart } from "lucide-react";
import { api, inr, errMsg } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const emptyForm = { name: "", sku: "", price: "", stock: 0, low_stock_threshold: 5 };

const ProductDialog = ({ open, setOpen, editing, onSaved }) => {
  const { t } = useI18n();
  const [form, setForm] = useState(editing || emptyForm);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form, price: Number(form.price), stock: Number(form.stock), low_stock_threshold: Number(form.low_stock_threshold) };
    try {
      if (editing?.id) await api.put(`/inventory/products/${editing.id}`, payload);
      else await api.post("/inventory/products", payload);
      toast.success(`${form.name} saved`);
      setOpen(false); onSaved();
    } catch (err) { toast.error(errMsg(err)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">{editing?.id ? form.name : t("addProduct")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>{t("name")}</Label><Input data-testid="product-name-input" required value={form.name} onChange={set("name")} className="h-12" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>SKU</Label><Input data-testid="product-sku-input" value={form.sku} onChange={set("sku")} className="h-12" /></div>
            <div className="space-y-1.5"><Label>{t("price")} (₹)</Label><Input data-testid="product-price-input" type="number" min="0" step="0.01" required value={form.price} onChange={set("price")} className="h-12" /></div>
            <div className="space-y-1.5"><Label>{t("stock")}</Label><Input data-testid="product-stock-input" type="number" min="0" value={form.stock} onChange={set("stock")} className="h-12" /></div>
            <div className="space-y-1.5"><Label>{t("lowStockThreshold")}</Label><Input data-testid="product-threshold-input" type="number" min="0" value={form.low_stock_threshold} onChange={set("low_stock_threshold")} className="h-12" /></div>
          </div>
          <Button data-testid="product-save-btn" className="w-full h-12">{t("save")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const SellDialog = ({ product, setProduct, onSold }) => {
  const { t } = useI18n();
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => api.get("/khata/customers").then((r) => r.data) });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/sales", { items: [{ product_id: product.id, qty: Number(qty) }], mode, customer_id: mode === "credit" ? customerId : null });
      toast.success(`${t("sell")}: ${product.name} x${qty}`);
      setProduct(null); onSold();
    } catch (err) { toast.error(errMsg(err)); }
  };
  if (!product) return null;
  return (
    <Dialog open={!!product} onOpenChange={() => setProduct(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">{t("sell")}: {product.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5"><Label>{t("qty")}</Label><Input data-testid="sell-qty-input" type="number" min="1" max={product.stock} value={qty} onChange={(e) => setQty(e.target.value)} className="h-12" /></div>
          <div className="space-y-1.5">
            <Label>{t("mode")}</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger data-testid="sell-mode-select" className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("cashSale")}</SelectItem>
                <SelectItem value="credit">{t("creditSale")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "credit" && (
            <div className="space-y-1.5">
              <Label>{t("customer")}</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger data-testid="sell-customer-select" className="h-12"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <p className="text-sm font-semibold">{inr(product.price * qty)}</p>
          <Button data-testid="sell-submit-btn" disabled={mode === "credit" && !customerId} className="w-full h-12">{t("record")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const OcrFlow = ({ onStocked }) => {
  const { t } = useI18n();
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/inventory/ocr", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); e.target.value = ""; }
  };

  const setItem = (i, k, v) => {
    const items = [...result.items];
    items[i] = { ...items[i], [k]: v };
    setResult({ ...result, items });
  };

  const confirm = async () => {
    try {
      const { data } = await api.post("/inventory/stock-in", {
        supplier_name: result.supplier_name || "",
        items: result.items.map((i) => ({ name: i.name, qty: Number(i.qty), unit_price: Number(i.unit_price), product_id: i.product_id })),
      });
      if (data.soft_warning) toast.warning(t("capWarning"));
      toast.success(`${data.updated.length} items → ${t("stock")}`);
      setResult(null); onStocked();
    } catch (err) { toast.error(errMsg(err)); }
  };

  if (busy) return <div data-testid="ocr-loading" className="border rounded-md bg-card p-10 flex flex-col items-center gap-3"><Loader2 className="animate-spin" size={28} /><p className="text-sm text-muted-foreground">{t("processing")}</p></div>;

  if (result)
    return (
      <div data-testid="ocr-confirm-screen" className="border rounded-md bg-card p-5 space-y-4">
        <h3 className="font-heading font-semibold">{t("confirmItems")}{result.supplier_name ? ` — ${result.supplier_name}` : ""}</h3>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_70px_90px_32px] gap-2 text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground">
            <span>{t("name")}</span><span>{t("qty")}</span><span>{t("price")} ₹</span><span />
          </div>
          {result.items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_90px_32px] gap-2 items-center">
              <Input data-testid={`ocr-item-name-${i}`} value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} className="h-11" />
              <Input data-testid={`ocr-item-qty-${i}`} type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} className="h-11" />
              <Input data-testid={`ocr-item-price-${i}`} type="number" value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} className="h-11" />
              <button data-testid={`ocr-item-remove-${i}`} onClick={() => setResult({ ...result, items: result.items.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-red-500"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button data-testid="ocr-confirm-btn" onClick={confirm} className="h-12 flex-1 active:scale-95 transition-transform duration-100">{t("addToStock")}</Button>
          <Button data-testid="ocr-cancel-btn" variant="outline" onClick={() => setResult(null)} className="h-12">{t("cancel")}</Button>
        </div>
      </div>
    );

  return (
    <button data-testid="ocr-upload-zone" onClick={() => fileRef.current?.click()}
      className="w-full border-2 border-dashed rounded-md p-10 flex flex-col items-center gap-3 hover:border-primary/50 active:scale-[0.99] transition-transform duration-100">
      <ScanLine size={32} className="text-muted-foreground" />
      <p className="font-medium">{t("uploadBill")}</p>
      <p className="text-xs text-muted-foreground">JPG / PNG · Gemini Vision</p>
      <input ref={fileRef} data-testid="ocr-file-input" type="file" accept="image/*" className="hidden" onChange={upload} />
    </button>
  );
};

export default function Inventory() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selling, setSelling] = useState(null);
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api.get("/inventory/products").then((r) => r.data) });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["summary"] }); };
  const remove = async (p) => { if (window.confirm(`Delete ${p.name}?`)) { await api.delete(`/inventory/products/${p.id}`); refresh(); } };

  return (
    <div data-testid="inventory-page" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("inventory")}</h1>
        <Button data-testid="add-product-btn" onClick={() => { setEditing(null); setDialogOpen(true); }} className="h-12 gap-2 active:scale-95 transition-transform duration-100"><Plus size={18} />{t("addProduct")}</Button>
      </div>

      <Tabs defaultValue="products">
        <TabsList className="mb-4">
          <TabsTrigger value="products" data-testid="products-tab">{t("products")}</TabsTrigger>
          <TabsTrigger value="ocr" data-testid="ocr-tab">{t("scanBill")}</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          {products.length === 0 && <p data-testid="no-products-msg" className="text-muted-foreground text-sm py-10 text-center">{t("noProducts")}</p>}
          <div className="border rounded-md bg-card divide-y">
            {products.map((p) => {
              const low = p.stock <= p.low_stock_threshold;
              return (
                <div key={p.id} data-testid={`product-row-${p.id}`} className="flex items-center justify-between p-4 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku ? `${p.sku} · ` : ""}{inr(p.price)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span data-testid={`product-stock-${p.id}`} className={`text-sm font-bold px-2.5 py-1 rounded-full ${low ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>{p.stock}</span>
                    <button data-testid={`sell-btn-${p.id}`} onClick={() => setSelling(p)} disabled={p.stock <= 0} className="p-2.5 rounded-md hover:bg-accent disabled:opacity-40 active:scale-95 transition-transform duration-100"><ShoppingCart size={16} /></button>
                    <button data-testid={`edit-product-btn-${p.id}`} onClick={() => { setEditing(p); setDialogOpen(true); }} className="p-2.5 rounded-md hover:bg-accent"><Pencil size={16} /></button>
                    <button data-testid={`delete-product-btn-${p.id}`} onClick={() => remove(p)} className="p-2.5 rounded-md hover:bg-accent text-muted-foreground"><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="ocr"><OcrFlow onStocked={refresh} /></TabsContent>
      </Tabs>

      {dialogOpen && <ProductDialog key={editing?.id || "new"} open={dialogOpen} setOpen={setDialogOpen} editing={editing} onSaved={refresh} />}
      <SellDialog key={selling?.id || "sell"} product={selling} setProduct={setSelling} onSold={refresh} />
    </div>
  );
}
