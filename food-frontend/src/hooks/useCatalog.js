import { useEffect, useState } from "react";
import { fetchCatalogExport } from "../api/products";
import { normalizeProduct } from "../utils/normalize";
import {
  getLocalVersion, setLocalVersion,
  getAllProducts, replaceProducts,
  updateProduct as dbUpdateProduct, addProduct as dbAddProduct,
  bulkReplace, clearAll as dbClearAll
} from "../db/catalogDb";

export default function useCatalog(search = "") {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [items, setItems]     = useState([]);

  // Сохранить изменения одной записи (в IndexedDB + в памяти)
  async function saveProduct(id, patch) {
    await dbUpdateProduct(id, patch);
    // обновим состояние в памяти
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }

  // добавить новую запись (локально)
  async function addProductLocally(newItem) {
    await dbAddProduct(newItem);
    const local = await getAllProducts();
    setItems(local);
  }

  // очистить локальную базу
  async function clearAll() {
    await dbClearAll();
    setItems([]);
  }

  // Принудительно загрузить «исходную базу» с сервера и заменить локальную
  async function reloadOriginal() {
    const { version, items: remoteItemsRaw } = await fetchCatalogExport("");
    const remoteItems = uniqById(remoteItemsRaw.map(normalizeProduct));
    await bulkReplace(remoteItems);
    await setLocalVersion(version);
    setItems(remoteItems);
  }

  function uniqById(arr) {
    const m = new Map();
    for (const x of arr) m.set(x.id, x);
    return Array.from(m.values());
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError("");

        // 1) Показать локальные данные мгновенно
        const local = await getAllProducts();
        console.log("Dexie total:", local.length, "uniq:", new Set(local.map(x => x.id)).size);
        if (!cancelled && local?.length) setItems(uniqById(local));

        // 2) Синхронизация с сервером
        const localVer = await getLocalVersion();
        const { version, items: remoteItemsRaw } = await fetchCatalogExport(search);
        const remoteItems = uniqById(remoteItemsRaw.map(normalizeProduct));

        if (!cancelled) {
          // Если версии различаются или локально пусто — обновляем IndexedDB
          if (!localVer || localVer !== version || !local?.length) {
            await replaceProducts(remoteItems);
            await setLocalVersion(version);
            setItems(remoteItems);
          } else {
            // Версия та же — но если поиск активен, берём свежие отфильтрованные
            setItems(remoteItems);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Ошибка синхронизации каталога");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [search]);

  return { loading, error, items, saveProduct, reloadOriginal, clearAll, addProductLocally};
}
