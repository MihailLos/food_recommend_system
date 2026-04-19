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
  const [allItems, setAllItems] = useState([]);

  // Сохранить изменения одной записи (в IndexedDB + в памяти)
  async function saveProduct(id, patch) {
    await dbUpdateProduct(id, patch);
    // обновим состояние в памяти
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
    setAllItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }

  // добавить новую запись (локально)
  async function addProductLocally(newItem) {
    await dbAddProduct(newItem);
    const local = await getAllProducts();
    const uniqLocal = uniqById(local);
    setAllItems(uniqLocal);
    setItems(applyLocalSearch(uniqLocal, search));
  }

  // очистить локальную базу
  async function clearAll() {
    await dbClearAll();
    setItems([]);
    setAllItems([]);
  }

  // Принудительно загрузить «исходную базу» с сервера и заменить локальную
  async function reloadOriginal() {
    const { version, items: remoteItemsRaw } = await fetchCatalogExport("");
    const remoteItems = uniqById(remoteItemsRaw.map(normalizeProduct));
    await bulkReplace(remoteItems);
    await setLocalVersion(version);
    setAllItems(remoteItems);
    setItems(remoteItems);
  }

  function uniqById(arr) {
    const m = new Map();
    for (const x of arr) m.set(x.id, x);
    return Array.from(m.values());
  }

  function applyLocalSearch(arr, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return arr;
    return arr.filter(item => String(item.name || "").toLowerCase().includes(q));
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError("");

        // 1) Показать локальные данные мгновенно
        const local = await getAllProducts();
        const uniqLocal = uniqById(local);
        if (!cancelled && uniqLocal?.length) {
          setAllItems(uniqLocal);
          setItems(applyLocalSearch(uniqLocal, search));
        }

        // 2) Синхронизация с сервером
        const localVer = await getLocalVersion();
        const hasSearch = String(search || "").trim().length > 0;

        if (!hasSearch) {
          const { version, items: remoteItemsRaw } = await fetchCatalogExport("");
          const remoteItems = uniqById(remoteItemsRaw.map(normalizeProduct));

          if (!cancelled) {
            // Только полный экспорт имеет право заменять локальный кэш.
            if (!localVer || localVer !== version || !uniqLocal?.length) {
              await replaceProducts(remoteItems);
              await setLocalVersion(version);
            }
            setAllItems(remoteItems);
            setItems(remoteItems);
          }
        } else {
          if (!localVer || !uniqLocal?.length) {
            const { version, items: remoteItemsRaw } = await fetchCatalogExport("");
            const remoteItems = uniqById(remoteItemsRaw.map(normalizeProduct));
            if (!cancelled) {
              await replaceProducts(remoteItems);
              await setLocalVersion(version);
              setAllItems(remoteItems);
            }
          }

          const { items: searchItemsRaw } = await fetchCatalogExport(search);
          const searchItems = uniqById(searchItemsRaw.map(normalizeProduct));
          if (!cancelled) {
            // Поиск обновляет только отображение, но не перезаписывает IndexedDB.
            setItems(searchItems);
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

  return { loading, error, items, allItems, saveProduct, reloadOriginal, clearAll, addProductLocally};
}
