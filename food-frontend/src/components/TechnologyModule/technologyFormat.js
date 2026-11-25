const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 });
const calculatedPercentFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCalculatedPercent(value, suffix = "") {
  return value == null ? "—" : calculatedPercentFormatter.format(Number(value)) + suffix;
}

export function formatNumber(value) {
  return value == null ? "—" : formatter.format(Number(value));
}

export function formatUnit(value, unit) {
  return value == null ? "—" : `${formatNumber(value)} ${unit}`;
}
