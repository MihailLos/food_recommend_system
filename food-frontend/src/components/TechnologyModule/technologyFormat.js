const formatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 });

export function formatNumber(value) {
  return value == null ? "—" : formatter.format(Number(value));
}

export function formatUnit(value, unit) {
  return value == null ? "—" : `${formatNumber(value)} ${unit}`;
}
