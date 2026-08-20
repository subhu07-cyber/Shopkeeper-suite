import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import dayjs from "dayjs";
import { UserRound, ArrowLeft, Sun, Moon, Languages } from "lucide-react";
import { useTheme } from "next-themes";
import { api, inr, errMsg } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import { AgingChip } from "@/components/AgingChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CustomerPortal() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [khata, setKhata] = useState(null);

  const sendOtp = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/customer/otp/send", { phone });
      if (data.dev_otp) toast.info(`MOCK OTP (Twilio not configured): ${data.dev_otp}`, { duration: 15000 });
      else toast.success("OTP sent via SMS");
      setStep(2);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/customer/otp/verify", { phone, otp });
      const res = await api.get("/customer/khata", { headers: { Authorization: `Bearer ${data.token}` } });
      setKhata(res.data);
      setStep(3);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/auth" data-testid="portal-back-link" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> {t("login")}</Link>
          <div className="flex gap-1">
            <button data-testid="portal-lang-toggle" onClick={() => setLang(lang === "en" ? "hi" : "en")} className="flex items-center gap-1 px-3 py-2 rounded-md hover:bg-accent text-sm font-semibold"><Languages size={16} />{lang === "en" ? "हिं" : "EN"}</button>
            <button data-testid="portal-theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-2 rounded-md hover:bg-accent"><Sun size={18} className="hidden dark:block" /><Moon size={18} className="dark:hidden" /></button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-primary text-primary-foreground flex items-center justify-center"><UserRound size={22} /></div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">{t("myKhata")}</h1>
        </div>

        {step === 1 && (
          <form onSubmit={sendOtp} className="border rounded-md bg-card p-6 space-y-4">
            <div className="space-y-1.5"><Label>{t("phone")}</Label><Input data-testid="portal-phone-input" required placeholder="+91XXXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12" /></div>
            <Button data-testid="portal-send-otp-btn" disabled={busy} className="w-full h-12 active:scale-95 transition-transform duration-100">{t("sendOtp")}</Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verify} className="border rounded-md bg-card p-6 space-y-4">
            <div className="space-y-1.5"><Label>{t("otp")}</Label><Input data-testid="portal-otp-input" required maxLength={6} inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} className="h-12 text-center text-xl tracking-[0.5em]" /></div>
            <Button data-testid="portal-verify-otp-btn" disabled={busy} className="w-full h-12 active:scale-95 transition-transform duration-100">{t("verifyOtp")}</Button>
          </form>
        )}

        {step === 3 && khata && khata.map((k) => (
          <div key={k.customer.id} data-testid="portal-khata-card" className="border rounded-md bg-card p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-heading font-bold text-lg">{k.shop_name}</p>
                <p className="text-sm text-muted-foreground">{k.customer.name}</p>
              </div>
              <AgingChip buckets={k.buckets} balance={k.balance} />
            </div>
            <div>
              <p className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground">{t("balance")}</p>
              <p data-testid="portal-balance" className="font-heading text-3xl font-bold tracking-tight">{inr(k.balance)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-md bg-emerald-500/10"><p className="font-bold">{inr(k.buckets.b0_30)}</p><p className="text-muted-foreground">0–30d</p></div>
              <div className="p-2 rounded-md bg-amber-500/10"><p className="font-bold">{inr(k.buckets.b31_60)}</p><p className="text-muted-foreground">31–60d</p></div>
              <div className="p-2 rounded-md bg-red-500/10"><p className="font-bold">{inr(k.buckets.b60_plus)}</p><p className="text-muted-foreground">60+d</p></div>
            </div>
            <div className="divide-y border-t">
              {k.entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{e.type === "credit" ? t("creditGiven") : t("paymentReceived")}</p>
                    <p className="text-xs text-muted-foreground">{dayjs(e.created_at).format("DD MMM YYYY")}</p>
                  </div>
                  <span className={`font-semibold text-sm ${e.type === "credit" ? "text-red-500" : "text-emerald-500"}`}>{e.type === "credit" ? "+" : "−"}{inr(e.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
