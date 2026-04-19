import Dexie from "dexie";

export const catalogDb = new Dexie("foodCatalogDB");

// Версия схемы. Если меняешь поля — поднимай номер .version(N)
catalogDb.version(2).stores({
  meta: "key",
  // primary key = id (первое поле)
  products: "id, name, typeId, typeName, subtypeId, subtypeName"
}).upgrade(async (tx) => {
  // Так как это локальный кэш каталога — проще и надёжнее
  // при смене схемы сбросить продукты и версию синка
  await tx.table("products").clear();
  await tx.table("meta").delete("version");
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
export async function getLocalVersion() {
  const row = await catalogDb.table("meta").get("version");
  return row?.value || null;
}
export async function setLocalVersion(value) {
  await catalogDb.table("meta").put({ key: "version", value });
}
export async function replaceProducts(items) {
  const deduped = dedupeByIdKeepLast(items);

  await catalogDb.products.clear();
  await catalogDb.products.bulkAdd(deduped);
}
export async function getAllProducts() {
  return catalogDb.table("products").toArray();
}
export async function updateProduct(id, patch) {
  // patch: { field: value, ... }
  await catalogDb.products.update(id, patch);
}
export async function addProduct(item) {
  await catalogDb.products.add(item);
}
export async function bulkReplace(items) {
  const deduped = dedupeByIdKeepLast(items);

  await catalogDb.transaction("rw", catalogDb.products, async () => {
    await catalogDb.products.clear();
    await catalogDb.products.bulkAdd(deduped);
  });
}
export async function clearAll() {
  await catalogDb.transaction("rw", catalogDb.meta, catalogDb.products, async () => {
    await catalogDb.products.clear();
    await catalogDb.meta.delete("version");
  });
}
