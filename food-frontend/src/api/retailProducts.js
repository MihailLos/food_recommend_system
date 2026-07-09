import client from "./client";

export async function fetchRetailProducts(params = {}) {
  return client.get("/api/retail-products/", { params }).then((response) => response.data);
}

export async function fetchRetailProduct(id) {
  return client.get(`/api/retail-products/${id}/`).then((response) => response.data);
}

export async function createRetailProduct(payload) {
  return client.post("/api/retail-products/", payload).then((response) => response.data);
}

export async function updateRetailProduct(id, payload) {
  return client.put(`/api/retail-products/${id}/`, payload).then((response) => response.data);
}

export async function deleteRetailProduct(id) {
  return client.delete(`/api/retail-products/${id}/`).then((response) => response.data);
}

export async function matchRetailName(name) {
  return client.post("/api/retail-products/match-name/", { name }).then((response) => response.data);
}

export async function matchRetailComposition(compositionText) {
  return client.post("/api/retail-products/match-composition/", { composition_text: compositionText }).then((response) => response.data);
}

export async function previewRetailNutritionFill(payload) {
  return client.post("/api/retail-products/fill-nutrients-preview/", payload).then((response) => response.data);
}
