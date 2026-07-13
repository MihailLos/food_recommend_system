import api from "./client";

/** Подтянуть все страницы results/next (поддержка абсолютных/относительных ссылок) */
export async function fetchAllPages(path) {
  const all = [];
  let next = path;
  while (next) {
    const { data } = await api.get(next);
    if (Array.isArray(data)) return data; // если пагинация выключена
    all.push(...(data.results || []));
    if (data.next) {
      if (/^https?:\/\//i.test(data.next)) {
        const u = new URL(data.next);
        next = u.pathname + u.search;
      } else {
        next = data.next;
      }
      next = next.replace(/^\/api\/api\//, "/api/");
    } else {
      next = null;
    }
  }
  return all;
}

/** Загрузить продукты с пищевыми веществами + опц. поиск */
export async function getProductsWithNutrients(search = "") {
  const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
  const path = `/api/products/with_nutrients/?ordering=id${q}`;
  return fetchAllPages(path);
}

export async function fetchCatalogExport(search = "") {
  const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
  const url = `/api/products/export/?ordering=id${q}`;
  const { data, headers } = await api.get(url);
  // Ожидаем { version, items }
  return { version: data.version || headers["x-catalog-version"], items: data.items };
}

export async function fetchCatalogMeta() {
  const { data, headers } = await api.get("/api/products/export-meta/");
  return {
    version: data.version || headers["x-catalog-version"] || null,
    items_count: data.items_count ?? null,
  };
}

export async function fetchProcessingOptions(productId) {
  const res = await api.get(`/api/products/${productId}/processing-options/`);
  return res.data; // { product_id, options: [...] }
}

export async function fetchProcessedProduct(productId, processingId, weight) {
  const res = await api.get(`/api/products/${productId}/processed/`, {
    params: { processing_id: processingId, weight }
  });
  return res.data; // { per_100g, per_weight, applied_rule_id, ... }
}
