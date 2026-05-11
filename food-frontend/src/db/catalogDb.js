import Dexie from "dexie";

export const catalogDb = new Dexie("foodCatalogDB");

// Версия схемы. Если меняешь поля — поднимай номер .version(N)
catalogDb.version(3).stores({
  meta: "&id, scope, key",
  // primary key = [scope+id], чтобы разные пользователи/guest-сессии не делили один каталог
  products: "[scope+id], scope, name, typeId, typeName, subtypeId, subtypeName"
}).upgrade(async (tx) => {
  // Так как это локальный кэш каталога — проще и надёжнее
  // при смене схемы сбросить продукты и версию синка
  await tx.table("products").clear();
  await tx.table("meta").clear();
});

function dedupeByIdKeepLast(items) {
  const map = new Map();
  for (const x of items) {
    if (x?.id === undefined || x?.id === null) continue; // или throw
    map.set(x.id, x); // перезапишет предыдущую => "keep last"
  }
  return Array.from(map.values());
}

// Утилиты
function metaId(scope, key) {
  return `${scope}:${key}`;
}

export async function getLocalVersion(scope) {
  const row = await catalogDb.table("meta").get(metaId(scope, "version"));
  return row?.value || null;
}
export async function setLocalVersion(scope, value) {
  await catalogDb.table("meta").put({ id: metaId(scope, "version"), scope, key: "version", value });
}
export async function replaceProducts(scope, items) {
  const deduped = dedupeByIdKeepLast(items);
  const scopedItems = deduped.map((item) => ({ ...item, scope }));

  await catalogDb.transaction("rw", catalogDb.products, async () => {
    await catalogDb.products.where("scope").equals(scope).delete();
    if (scopedItems.length) {
      await catalogDb.products.bulkPut(scopedItems);
    }
  });
}
export async function getAllProducts(scope) {
  return catalogDb.table("products").where("scope").equals(scope).toArray();
}
export async function updateProduct(scope, id, patch) {
  // patch: { field: value, ... }
  const current = await catalogDb.products.get([scope, id]);
  if (!current) return;
  await catalogDb.products.put({ ...current, ...patch, scope, id });
}
export async function addProduct(scope, item) {
  await catalogDb.products.put({ ...item, scope });
}
export async function bulkReplace(scope, items) {
  return replaceProducts(scope, items);
}
export async function clearScope(scope) {
  await catalogDb.transaction("rw", catalogDb.meta, catalogDb.products, async () => {
    await catalogDb.products.where("scope").equals(scope).delete();
    await catalogDb.meta.delete(metaId(scope, "version"));
  });
}
