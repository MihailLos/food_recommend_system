export function fmt(num, digits = 2) {
  if (num === null || num === undefined || num === "" || isNaN(num)) return "—";
  return Number(num).toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

export function parseRuNumber(str) {
  if (str === null || str === undefined || str === "") return null;
  const s = String(str).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}