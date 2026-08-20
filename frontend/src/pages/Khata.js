import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, ChevronRight } from "lucide-react";
import { api, inr, errMsg } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import { AgingChip } from "@/components/AgingChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function Khata() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", credit_threshold: 10000 });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => api.get("/khata/customers").then((r) => r.data) });

  const filtered = customers.filter((c) => (c.name + c.phone).toLowerCase().includes(q.toLowerCase()));

  const addCustomer = async (e) => {
    e.preventDefault();
    try {
      await api.post("/khata/customers", { ...form, credit_threshold: Number(form.credit_threshold) });
      toast.success(`${form.name} added`);
      setOpen(false);
      setForm({ name: "", phone: "", credit_threshold: 10000 });
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <div data-testid="khata-page" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("khata")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-customer-btn" className="h-12 gap-2 active:scale-95 transition-transform duration-100"><Plus size={18} />{t("addCustomer")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-heading">{t("addCustomer")}</DialogTitle></DialogHeader>
            <form onSubmit={addCustomer} className="space-y-4">
              <div className="space-y-1.5"><Label>{t("name")}</Label><Input data-testid="customer-name-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-12" /></div>
              <div className="space-y-1.5"><Label>{t("phone")}</Label><Input data-testid="customer-phone-input" required placeholder="+91XXXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-12" /></div>
              <div className="space-y-1.5"><Label>{t("creditLimit")} (₹)</Label><Input data-testid="customer-threshold-input" type="number" min="0" value={form.credit_threshold} onChange={(e) => setForm({ ...form, credit_threshold: e.target.value })} className="h-12" /></div>
              <Button data-testid="customer-save-btn" className="w-full h-12">{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="customer-search-input" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-12 pl-10" />
      </div>

      {customers.length === 0 && <p data-testid="no-customers-msg" className="text-muted-foreground text-sm py-10 text-center">{t("noCustomers")}</p>}

      <div className="border rounded-md bg-card divide-y">
        {filtered.map((c) => (
          <Link key={c.id} to={`/khata/${c.id}`} data-testid={`customer-row-${c.id}`} className="flex items-center justify-between p-4 hover:bg-accent active:scale-[0.99] transition-transform duration-100">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.phone}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className={`font-semibold ${c.balance > 0 ? "" : "text-muted-foreground"}`}>{inr(c.balance)}</p>
                {c.overdue && <p className="text-[10px] font-bold text-red-500 uppercase">Overdue</p>}
              </div>
              <AgingChip buckets={c.buckets} balance={c.balance} />
              <ChevronRight size={18} className="text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
