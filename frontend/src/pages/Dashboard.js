import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { IndianRupee, AlertTriangle, PackageOpen, Wallet, Sunrise } from "lucide-react";
import { inr, cachedGet } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import { AgingChip } from "@/components/AgingChip";

const StatCard = ({ icon: Icon, label, value, accent, testId, to }) => (
  <Link to={to || "#"} data-testid={testId} className="border rounded-md bg-card p-5 flex flex-col gap-3 active:scale-[0.98] transition-transform duration-100 hover:border-primary/40">
    <div className="flex items-center justify-between">
      <span className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground">{label}</span>
      <Icon size={18} className={accent} />
    </div>
    <span className="font-heading text-2xl md:text-3xl font-bold tracking-tight">{value}</span>
  </Link>
);

export default function Dashboard() {
  const { t } = useI18n();
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: () => cachedGet("/analytics/summary") });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => cachedGet("/khata/customers") });
  const { data: digest } = useQuery({ queryKey: ["digest"], queryFn: () => cachedGet("/analytics/digest") });

  const overdueCustomers = customers.filter((c) => c.overdue).sort((a, b) => b.balance - a.balance);
  const b = summary?.aging_buckets || { b0_30: 0, b31_60: 0, b60_plus: 0 };
  const totalAging = b.b0_30 + b.b31_60 + b.b60_plus || 1;

  return (
    <div data-testid="dashboard-page" className="space-y-8">
      <h1 className="font-heading text-3xl font-bold tracking-tight">{t("dashboard")}</h1>

      {digest && (
        <div data-testid="daily-digest-card" className="border rounded-md bg-card p-5">
          <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground flex items-center gap-2 mb-4"><Sunrise size={16} className="text-amber-500" /> {t("dailyDigest")}</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("yesterdaySales")}</p>
              <p data-testid="digest-yesterday-sales" className="font-heading text-xl font-bold">{inr(digest.yesterday_sales)}</p>
              <p className="text-xs text-muted-foreground">{digest.yesterday_txns} txns</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("newDues")}</p>
              <p data-testid="digest-new-dues" className="font-heading text-xl font-bold">{inr(digest.new_dues)}</p>
              <p className="text-xs text-muted-foreground">{digest.new_dues_count} {t("customers").toLowerCase()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("toReorder")}</p>
              <p data-testid="digest-reorder-count" className="font-heading text-xl font-bold">{digest.reorder_count}</p>
              <p className="text-xs text-muted-foreground truncate">{digest.reorder_items.join(", ") || "—"}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testId="stat-today-sales" to="/analytics" icon={IndianRupee} label={t("todaySales")} value={inr(summary?.today_sales)} accent="text-emerald-500" />
        <StatCard testId="stat-outstanding" to="/khata" icon={Wallet} label={t("outstanding")} value={inr(summary?.outstanding)} accent="text-blue-500" />
        <StatCard testId="stat-overdue" to="/khata" icon={AlertTriangle} label={t("overdue")} value={summary?.overdue_count ?? 0} accent="text-red-500" />
        <StatCard testId="stat-low-stock" to="/inventory" icon={PackageOpen} label={t("lowStock")} value={summary?.low_stock_count ?? 0} accent="text-amber-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-md bg-card p-6">
          <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground mb-5">{t("agingDistribution")}</h2>
          <div className="flex h-4 rounded-full overflow-hidden bg-muted mb-4">
            {b.b0_30 > 0 && <div className="bg-emerald-500" style={{ width: `${(b.b0_30 / totalAging) * 100}%` }} />}
            {b.b31_60 > 0 && <div className="bg-amber-500" style={{ width: `${(b.b31_60 / totalAging) * 100}%` }} />}
            {b.b60_plus > 0 && <div className="bg-red-500" style={{ width: `${(b.b60_plus / totalAging) * 100}%` }} />}
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500" />0–30 {t("days")}</span><span className="font-semibold">{inr(b.b0_30)}</span></div>
            <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500" />31–60 {t("days")}</span><span className="font-semibold">{inr(b.b31_60)}</span></div>
            <div className="flex justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500" />60+ {t("days")}</span><span className="font-semibold">{inr(b.b60_plus)}</span></div>
          </div>
        </div>

        <div className="border rounded-md bg-card p-6">
          <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground mb-4">{t("overdue")}</h2>
          {overdueCustomers.length === 0 && <p className="text-sm text-muted-foreground py-6">—</p>}
          <div className="space-y-1">
            {overdueCustomers.slice(0, 6).map((c) => (
              <Link key={c.id} to={`/khata/${c.id}`} data-testid={`overdue-customer-${c.id}`} className="flex items-center justify-between p-3 rounded-md hover:bg-accent active:scale-[0.98] transition-transform duration-100">
                <div>
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.oldest_days} {t("days")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">{inr(c.balance)}</span>
                  <AgingChip buckets={c.buckets} balance={c.balance} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
