import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Store, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", shop_name: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (mode) => async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form);
      navigate("/");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center"><Store size={24} /></div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">The Shopkeeper's Day</h1>
            <p className="text-sm text-muted-foreground">Khata · Inventory · Suppliers</p>
          </div>
        </div>
        <div className="border rounded-md bg-card p-6">
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full mb-5">
              <TabsTrigger value="login" data-testid="login-tab">{t("login")}</TabsTrigger>
              <TabsTrigger value="signup" data-testid="signup-tab">{t("signup")}</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={submit("login")} className="space-y-4">
                <div className="space-y-1.5"><Label>{t("email")}</Label><Input data-testid="login-email-input" type="email" required value={form.email} onChange={set("email")} className="h-12" /></div>
                <div className="space-y-1.5"><Label>{t("password")}</Label><Input data-testid="login-password-input" type="password" required value={form.password} onChange={set("password")} className="h-12" /></div>
                <Button data-testid="login-submit-btn" disabled={busy} className="w-full h-12 active:scale-95 transition-transform duration-100">{t("login")}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={submit("signup")} className="space-y-4">
                <div className="space-y-1.5"><Label>{t("name")}</Label><Input data-testid="signup-name-input" required value={form.name} onChange={set("name")} className="h-12" /></div>
                <div className="space-y-1.5"><Label>{t("shopName")}</Label><Input data-testid="signup-shopname-input" required value={form.shop_name} onChange={set("shop_name")} className="h-12" /></div>
                <div className="space-y-1.5"><Label>{t("email")}</Label><Input data-testid="signup-email-input" type="email" required value={form.email} onChange={set("email")} className="h-12" /></div>
                <div className="space-y-1.5"><Label>{t("password")}</Label><Input data-testid="signup-password-input" type="password" required minLength={6} value={form.password} onChange={set("password")} className="h-12" /></div>
                <Button data-testid="signup-submit-btn" disabled={busy} className="w-full h-12 active:scale-95 transition-transform duration-100">{t("signup")}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
        <Link to="/customer" data-testid="customer-login-link" className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150">
          <UserRound size={16} /> {t("customerLogin")} →
        </Link>
      </div>
    </div>
  );
}
