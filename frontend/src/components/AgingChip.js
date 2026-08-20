export const AgingChip = ({ buckets, balance }) => {
  if (!balance || balance <= 0)
    return <span data-testid="aging-chip-clear" className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Clear</span>;
  let cls = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  let label = "0-30d";
  if (buckets?.b60_plus > 0) { cls = "bg-red-500/15 text-red-600 dark:text-red-400"; label = "60+d"; }
  else if (buckets?.b31_60 > 0) { cls = "bg-amber-500/15 text-amber-600 dark:text-amber-400"; label = "31-60d"; }
  return <span data-testid="aging-chip" className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
};
