import { useEffect, useState } from "react";
import { fetchCatalogExport, fetchCatalogMeta } from "../api/products";
import { normalizeProduct } from "../utils/normalize";
import {
  getLocalVersion, setLocalVersion,
  getAllProducts, replaceProducts,
  updateProduct as dbUpdateProduct, addProduct as dbAddProduct,
  bulkReplace, clearScope as dbClearScope
} from "../db/catalogDb";

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

export default function useCatalog(search = "", scope = "guest:default") {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [items, setItems]     = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [isReloading, setIsReloading] = useState(false);
  const [localVersion, setLocalVersionState] = useState(null);
  const [remoteVersion, setRemoteVersion] = useState(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [syncReady, setSyncReady] = useState(false);

  // Сохранить изменения одной записи (в IndexedDB + в памяти)
  async function saveProduct(id, patch) {
    await dbUpdateProduct(scope, id, patch);
    // обновим состояние в памяти
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
    setAllItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }

  // добавить новую запись (локально)
  async function addProductLocally(newItem) {
    await dbAddProduct(scope, newItem);
    const local = await getAllProducts(scope);
    const uniqLocal = uniqById(local);
    setAllItems(uniqLocal);
    setItems(applyLocalSearch(uniqLocal, search));
  }

  // очистить локальную базу
  async function clearAll() {
    await dbClearScope(scope);
    setItems([]);
    setAllItems([]);
    setLocalVersionState(null);
    setRemoteVersion(null);
    setHasUpdate(false);
    setStatusMessage("Локальная база очищена.");
  }

  // Принудительно загрузить «исходную базу» с сервера и заменить локальную
  async function reloadOriginal() {
    setIsReloading(true);
    setError("");
    setStatusMessage("");
    try {
      const { version, items: remoteItemsRaw } = await fetchCatalogExport("");
      const remoteItems = uniqById(remoteItemsRaw.map(normalizeProduct));
      await dbClearScope(scope);
      await bulkReplace(scope, remoteItems);
      await setLocalVersion(scope, version);

      const refreshedLocal = uniqById(await getAllProducts(scope));
      setAllItems(refreshedLocal);
      setItems(applyLocalSearch(refreshedLocal, search));
      setLocalVersionState(version);
      setRemoteVersion(version);
      setHasUpdate(false);
      setSyncReady(true);
      setStatusMessage("Исходная база успешно загружена и заменила локальные изменения.");
    } catch (e) {
      setError(e?.message || "Не удалось загрузить исходную базу.");
    } finally {
      setIsReloading(false);
    }
  }

  useEffect(() => {
    setItems(applyLocalSearch(allItems, search));
  }, [allItems, search]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        setSyncReady(false);

        // 1) Показать локальные данные мгновенно
        const local = await getAllProducts(scope);
        const uniqLocal = uniqById(local);
        const currentLocalVersion = await getLocalVersion(scope);
        if (!cancelled) {
          setLocalVersionState(currentLocalVersion);
        }
        if (!cancelled && uniqLocal?.length) {
          setAllItems(uniqLocal);
        }

        // 2) Если локального каталога нет, грузим исходную базу один раз
        if (!uniqLocal?.length) {
          const { version, items: remoteItemsRaw } = await fetchCatalogExport("");
          const remoteItems = uniqById(remoteItemsRaw.map(normalizeProduct));
          if (!cancelled) {
            await replaceProducts(scope, remoteItems);
            await setLocalVersion(scope, version);
            setLocalVersionState(version);
            setRemoteVersion(version);
            setHasUpdate(false);
            setAllItems(remoteItems);
            setSyncReady(true);
          }
          return;
        }

        // 3) Фоновая лёгкая проверка версии каталога
        const meta = await fetchCatalogMeta();
        if (!cancelled) {
          const nextRemoteVersion = meta?.version || null;
          setRemoteVersion(nextRemoteVersion);
          setHasUpdate(Boolean(currentLocalVersion && nextRemoteVersion && currentLocalVersion !== nextRemoteVersion));
          setSyncReady(true);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Ошибка синхронизации каталога");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [scope]);

  return {
    loading,
    error,
    items,
    allItems,
    saveProduct,
    reloadOriginal,
    clearAll,
    addProductLocally,
    localVersion,
    remoteVersion,
    hasUpdate,
    syncReady,
    statusMessage,
    isReloading,
  };
}
