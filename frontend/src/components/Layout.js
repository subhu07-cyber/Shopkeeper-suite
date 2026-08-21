import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutDashboard, BookOpen, Package, Truck, BarChart3, Bell, Sun, Moon, Languages, LogOut, Store, WifiOff, CloudUpload } from "lucide-react";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { flushQueue, pendingCount } from "@/lib/offline";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", key: "dashboard", icon: LayoutDashboard },
  { to: "/khata", key: "khata", icon: BookOpen },
  { to: "/inventory", key: "inventory", icon: Package },
  { to: "/suppliers", key: "suppliers", icon: Truck },
  { to: "/analytics", key: "analytics", icon: BarChart3 },
];

const SyncIndicator = () => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => pendingCount().then(setPending).catch(() => {});
    const onOnline = async () => {
      setOnline(true);
      const { synced, failed } = await flushQueue(api).catch(() => ({ synced: 0, failed: 0 }));
      if (synced > 0) {
        toast.success(t("synced"));
        qc.invalidateQueries();
      }
      if (failed > 0) toast.error(`${failed} ${t("syncFailed")}`);
      refresh();
    };
    const onOffline = () => setOnline(false);
    refresh();
    if (navigator.onLine) onOnline();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("offline-queue-changed", refresh);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("offline-queue-changed", refresh);
    };
  }, [qc, t]);

  if (online && pending === 0) return null;
  return (
    <span data-testid="sync-indicator" className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold ${online ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
      {online ? <CloudUpload size={14} /> : <WifiOff size={14} />}
      {online ? `${pending} ${t("pendingSync")}` : t("offline")}{!online && pending > 0 ? ` · ${pending}` : ""}
    </span>
  );
};

const NotificationBell = () => {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data: notifs = [] } = useQuery({ queryKey: ["notifications"], queryFn: () => api.get("/notifications").then((r) => r.data), refetchInterval: 30000 });
  const unread = notifs.filter((n) => !n.read).length;
  const markRead = async (id) => { await api.post(`/notifications/${id}/read`); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button data-testid="notifications-bell" className="relative p-2.5 rounded-md hover:bg-accent active:scale-95 transition-transform duration-100">
          <Bell size={20} />
          {unread > 0 && <span data-testid="notifications-unread-count" className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b font-semibold font-heading">{t("notifications")}</div>
        <div className="max-h-80 overflow-y-auto">
          {notifs.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("noNotifications")}</p>}
          {notifs.slice(0, 20).map((n) => (
            <button key={n.id} onClick={() => markRead(n.id)} className={`w-full text-left p-3 border-b last:border-0 hover:bg-accent ${n.read ? "opacity-60" : ""}`}>
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.message}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [dark] = useState();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col border-r bg-card z-40">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center"><Store size={20} /></div>
            <div>
              <p className="font-heading font-bold leading-tight">{user?.shop_name}</p>
              <p className="text-xs text-muted-foreground">{user?.name}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} data-testid={`nav-${key}`}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors duration-150 active:scale-[0.98] ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              <Icon size={20} /> {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <Button variant="ghost" data-testid="logout-btn" className="w-full justify-start gap-3" onClick={() => { logout(); navigate("/auth"); }}>
            <LogOut size={18} /> {t("logout")}
          </Button>
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-30 md:ml-64 flex items-center justify-between px-4 md:px-8 h-16 border-b bg-background/80 backdrop-blur-lg">
        <div className="md:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center"><Store size={16} /></div>
          <span className="font-heading font-bold text-sm">{user?.shop_name}</span>
        </div>
        <div className="hidden md:block" />
        <div className="flex items-center gap-1">
          <SyncIndicator />
          <button data-testid="lang-toggle" onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md hover:bg-accent text-sm font-semibold active:scale-95 transition-transform duration-100">
            <Languages size={18} /> {lang === "en" ? "हिं" : "EN"}
          </button>
          <button data-testid="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2.5 rounded-md hover:bg-accent active:scale-95 transition-transform duration-100">
            <Sun size={20} className="hidden dark:block" /><Moon size={20} className="dark:hidden" />
          </button>
          <NotificationBell />
          <button data-testid="logout-btn-mobile" onClick={() => { logout(); navigate("/auth"); }} className="md:hidden p-2.5 rounded-md hover:bg-accent"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="md:ml-64 px-4 md:px-8 py-6 pb-28 md:pb-10 animate-in fade-in duration-300">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-lg grid grid-cols-5">
        {navItems.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} data-testid={`bottomnav-${key}`}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-1 min-h-[64px] text-[10px] font-semibold active:scale-95 transition-transform duration-100 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
            <Icon size={22} /> {t(key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
