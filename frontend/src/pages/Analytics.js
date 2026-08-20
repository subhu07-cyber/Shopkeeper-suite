import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api, inr } from "@/lib/api";
import { useI18n } from "@/context/I18nContext";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AGING_COLORS = ["#10B981", "#F59E0B", "#EF4444"];

const inrCompact = (v) => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return `₹${v}`;
};

export default function Analytics() {
  const { t } = useI18n();
  const [period, setPeriod] = useState("daily");
  const { data: sales = [] } = useQuery({ queryKey: ["sales", period], queryFn: () => api.get(`/analytics/sales?period=${period}`).then((r) => r.data) });
  const { data: top = [] } = useQuery({ queryKey: ["top-items"], queryFn: () => api.get("/analytics/top-items").then((r) => r.data) });
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: () => api.get("/analytics/summary").then((r) => r.data) });

  const b = summary?.aging_buckets || {};
  const agingData = [
    { name: "0-30d", value: b.b0_30 || 0 },
    { name: "31-60d", value: b.b31_60 || 0 },
    { name: "60+d", value: b.b60_plus || 0 },
  ].filter((d) => d.value > 0);

  return (
    <div data-testid="analytics-page" className="space-y-8">
      <h1 className="font-heading text-3xl font-bold tracking-tight">{t("analytics")}</h1>

      <div className="border rounded-md bg-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground">{t("todaySales")}: {inr(summary?.today_sales)}</h2>
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              <TabsTrigger value="daily" data-testid="period-daily">{t("daily")}</TabsTrigger>
              <TabsTrigger value="weekly" data-testid="period-weekly">{t("weekly")}</TabsTrigger>
              <TabsTrigger value="monthly" data-testid="period-monthly">{t("monthly")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {sales.length === 0 ? (
          <p data-testid="sales-chart-empty" className="text-sm text-muted-foreground py-16 text-center">—</p>
        ) : (
          <div className="h-64" data-testid="sales-chart" style={{ minWidth: 200, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
              <BarChart data={sales} margin={{ left: 8 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={60} tickFormatter={inrCompact} />
                <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 14 }} />
                <Bar dataKey="amount" fill="currentColor" className="text-primary" radius={[4, 4, 0, 0]} maxBarSize={64} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-md bg-card p-5">
          <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground mb-4">{t("topItems")}</h2>
          {top.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          <div className="space-y-2">
            {top.map((i, idx) => (
              <div key={i.name} data-testid={`top-item-${idx}`} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-3"><span className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-xs font-bold">{idx + 1}</span>{i.name}</span>
                <span className="font-semibold">{i.qty} {t("qty").toLowerCase()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-md bg-card p-5">
          <h2 className="text-xs tracking-[0.05em] uppercase font-semibold text-muted-foreground mb-4">{t("agingDistribution")}</h2>
          {agingData.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          {agingData.length > 0 && (
            <div className="h-56" data-testid="aging-pie-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={agingData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {agingData.map((_, i) => <Cell key={i} fill={AGING_COLORS[i % 3]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 14 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
