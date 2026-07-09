import { useCallback, useEffect, useState } from "react";
import {
  createRetailProduct,
  deleteRetailProduct,
  fetchRetailProducts,
  updateRetailProduct,
} from "../../api/retailProducts";

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export default function useRetailProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchRetailProducts();
      setProducts(normalizeList(data));
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
        requestError?.response?.data?.error ||
        requestError?.message ||
        "Не удалось загрузить магазинные продукты."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const saveProduct = useCallback(async (draft) => {
    if (draft?.id) {
      await updateRetailProduct(draft.id, draft);
    } else {
      await createRetailProduct(draft);
    }
    await loadProducts();
  }, [loadProducts]);

  const removeProduct = useCallback(async (productId) => {
    await deleteRetailProduct(productId);
    await loadProducts();
  }, [loadProducts]);

  return {
    products,
    loading,
    error,
    loadProducts,
    saveProduct,
    removeProduct,
  };
}
