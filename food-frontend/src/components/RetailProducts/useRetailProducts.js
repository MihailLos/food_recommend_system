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
    let savedProduct;
    if (draft?.id) {
      savedProduct = await updateRetailProduct(draft.id, draft);
    } else {
      savedProduct = await createRetailProduct(draft);
    }
    setProducts((current) => {
      const exists = current.some((product) => product.id === savedProduct.id);
      return exists
        ? current.map((product) => (product.id === savedProduct.id ? savedProduct : product))
        : [savedProduct, ...current];
    });
    return savedProduct;
  }, []);

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
