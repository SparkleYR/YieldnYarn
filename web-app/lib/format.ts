/** Number formatting shared by every screen, Indian digit grouping (1,20,000). */

/** "1,200" for "1200.00"; keeps up to two decimals only when they matter. */
export function formatQty(value: string | number | null | undefined, locale = "en-IN") {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** "₹2,450" (whole rupees unless paise matter). */
export function formatRupees(value: string | number | null | undefined, locale = "en-IN") {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString(locale, { maximumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
}

/** "₹2.6 L" / "₹1.2 Cr" for big totals on tiles. */
export function formatRupeesShort(value: number, locale = "en-IN") {
  if (value >= 1e7) return `₹${(value / 1e7).toLocaleString(locale, { maximumFractionDigits: 1 })} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toLocaleString(locale, { maximumFractionDigits: 1 })} L`;
  return formatRupees(value, locale);
}
