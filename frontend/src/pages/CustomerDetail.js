import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import { api, inr, errMsg, offlinePost, cachedGet, CAP, SOFT_CAP } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import { AgingChip } from "@/components/AgingChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EntryForm = ({ type, customerId, onDone }) => {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const num = Number(amount);
  const blocked = num > CAP;
  const warned = num >= SOFT_CAP && !blocked;

  const submit = async (e) => {
    e.preventDefault();
    if (blocked) return toast.error(t("capBlocked"));
    try {
      const { data, queued } = await offlinePost("/khata/entries", { customer_id: customerId, type, amount: num, note, client_id: crypto.randomUUID() });
      if (queued) toast.info(t("offlineSaved"));
      else {
        if (data.soft_warning) toast.warning(t("capWarning"));
        toast.success(`${inr(num)} ${type === "credit" ? t("creditGiven") : t("paymentReceived")}`);
      }
      setAmount(""); setNote("");
      onDone();
    } catch (err) { toast.error(errMsg(err)); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t("amount")} (₹)</Label>
        <Input data-testid={`${type}-amount-input`} type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12" />
        {warned && <p data-testid="cap-soft-warning" className="text-xs font-semibold text-amber-500">{t("capWarning")}</p>}
        {blocked && <p data-testid="cap-hard-block" className="text-xs font-semibold text-red-500">{t("capBlocked")}</p>}
      </div>
      <div className="space-y-1.5"><Label>{t("note")}</Label><Input data-testid={`${type}-note-input`} value={note} onChange={(e) => setNote(e.target.value)} className="h-12" /></div>
      <Button data-testid={`${type}-submit-btn`} disabled={blocked} className="w-full h-12 active:scale-95 transition-transform duration-100">{t("record")}</Button>
    </form>
  );
};

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const { data: c, refetch } = useQuery({ queryKey: ["customer", id], queryFn: () => cachedGet(`/khata/customers/${id}`) });

  const refresh = () => { refetch(); qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["summary"] }); };

  const remind = async () => {
    setSending(true);
    try {
      const { data } = await api.post(`/khata/customers/${id}/remind`);
      toast.success(t("reminderSent") + (data.mock ? " — MOCK (Twilio not configured)" : ""));
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) { toast.error(errMsg(err)); } finally { setSending(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    await api.delete(`/khata/customers/${id}`);
    qc.invalidateQueries({ queryKey: ["customers"] });
    navigate("/khata");
  };

  if (!c) return null;

  return (
    <div data-testid="customer-detail-page" className="space-y-6 max-w-3xl">
      <button data-testid="back-btn" onClick={() => navigate("/khata")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> {t("khata")}</button>

      <div className="border rounded-md bg-card p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">{c.name}</h1>
            <p className="text-sm text-muted-foreground">{c.phone} · {t("creditLimit")}: {inr(c.credit_threshold)}</p>
          </div>
          <div className="flex items-center gap-2">
            <AgingChip buckets={c.buckets} balance={c.balance} />
            <button data-testid="delete-customer-btn" onClick={remove} className="p-2 rounded-md hover:bg-accent text-muted-foreground"><Trash2 size={16} /></button>
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground">{t("balance")}</p>
            <p data-testid="customer-balance" className={`font-heading text-3xl font-bold tracking-tight ${c.overdue ? "text-red-500" : ""}`}>{inr(c.balance)}</p>
          </div>
          <Button data-testid="send-reminder-btn" onClick={remind} disabled={sending || c.balance <= 0} className="h-12 gap-2 active:scale-95 transition-transform duration-100">
            <Send size={16} /> {t("sendReminder")}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-md bg-emerald-500/10"><p className="font-bold text-emerald-600 dark:text-emerald-400">{inr(c.buckets.b0_30)}</p><p className="text-muted-foreground">0–30d</p></div>
          <div className="p-2 rounded-md bg-amber-500/10"><p className="font-bold text-amber-600 dark:text-amber-400">{inr(c.buckets.b31_60)}</p><p className="text-muted-foreground">31–60d</p></div>
          <div className="p-2 rounded-md bg-red-500/10"><p className="font-bold text-red-600 dark:text-red-400">{inr(c.buckets.b60_plus)}</p><p className="text-muted-foreground">60+d</p></div>
        </div>
      </div>

      <div className="border rounded-md bg-card p-6">
        <Tabs defaultValue="credit">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="credit" data-testid="credit-tab">{t("creditGiven")}</TabsTrigger>
            <TabsTrigger value="payment" data-testid="payment-tab">{t("paymentReceived")}</TabsTrigger>
          </TabsList>
          <TabsContent value="credit"><EntryForm type="credit" customerId={id} onDone={refresh} /></TabsContent>
          <TabsContent value="payment"><EntryForm type="payment" customerId={id} onDone={refresh} /></TabsContent>
        </Tabs>
      </div>

      <div className="border rounded-md bg-card">
        <div className="p-4 border-b font-heading font-semibold">{t("transactions")}</div>
        <div className="divide-y">
          {(c.entries || []).map((e) => (
            <div key={e.id} data-testid={`entry-row-${e.id}`} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">{e.type === "credit" ? t("creditGiven") : t("paymentReceived")}</p>
                <p className="text-xs text-muted-foreground">{dayjs(e.created_at).format("DD MMM YYYY, HH:mm")}{e.note ? ` · ${e.note}` : ""}</p>
              </div>
              <span className={`font-semibold ${e.type === "credit" ? "text-red-500" : "text-emerald-500"}`}>{e.type === "credit" ? "+" : "−"}{inr(e.amount)}</span>
            </div>
          ))}
          {(!c.entries || c.entries.length === 0) && <p className="p-6 text-sm text-muted-foreground">—</p>}
        </div>
      </div>
    </div>
  );
}
