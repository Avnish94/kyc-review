const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const formatDateTime = (d: Date) => `${dateTime.format(d)} UTC`;
export const formatDate = (d: Date) => dateOnly.format(d);
export const formatCurrency = (n: number) => currency.format(n);

/** Human label for enum-like strings stored in the DB, with a safe fallback. */
export function labelFor<K extends string>(labels: Record<K, string>, value: string): string {
  return (labels as Record<string, string>)[value] ?? value;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
