import api from "./client";
import { fetchAllPages } from "./products";

const NUTRIENT_GROUPS = {
  macros: ["protein_g", "fats_g", "carbs_g", "mds_g", "starch_g", "water_g", "energy_kcal", "dietary_fiber_g"],
  minerals: ["na_mg", "k_mg", "ca_mg", "mg_mg", "p_mg", "fe_mg", "ash_g"],
  vitamins: ["a_mg", "beta_carotene_mg", "b1_mg", "b2_mg", "pp_mg", "c_mg", "retinol_index", "tocopherol_index", "niacin_index"],
  fat_acids: ["nlc_g", "pufa_g", "cholesterol_g"],
  other_nutrients: ["organic_acids_g", "alcohol_pct"],
};

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

export function buildAdminProductPayload(form) {
  const nutrients = {};
  for (const [groupKey, fields] of Object.entries(NUTRIENT_GROUPS)) {
    nutrients[groupKey] = {};
    for (const field of fields) {
      const formKey = field === "dietary_fiber_g" ? "fiber_g" : field;
      nutrients[groupKey][field] = numberOrNull(form[formKey]);
    }
  }
  return {
    name: String(form.name || "").trim(),
    subtype_id: form.subtypeId ? Number(form.subtypeId) : null,
    is_complex: form.isComplex ? 1 : 0,
    nutrients,
    allergen_ids: Array.isArray(form.allergenIds) ? form.allergenIds.map(Number) : [],
    is_child_allowed: Boolean(form.isChildAllowed),
  };
}

export async function createServerGroup(payload) {
  const { data } = await api.post("/api/admin-catalog/groups/", payload);
  return data;
}

export async function updateServerGroup(id, payload) {
  const { data } = await api.patch(`/api/admin-catalog/groups/${id}/`, payload);
  return data;
}

export async function createServerSubgroup(payload) {
  const { data } = await api.post("/api/admin-catalog/subgroups/", payload);
  return data;
}

export async function updateServerSubgroup(id, payload) {
  const { data } = await api.patch(`/api/admin-catalog/subgroups/${id}/`, payload);
  return data;
}

export async function createServerProduct(form) {
  const { data } = await api.post("/api/admin-catalog/products/", buildAdminProductPayload(form));
  return data;
}

export async function fetchServerProduct(id) {
  const { data } = await api.get(`/api/admin-catalog/products/${id}/`);
  return data;
}

export async function updateServerProduct(id, form) {
  const { data } = await api.patch(`/api/admin-catalog/products/${id}/`, buildAdminProductPayload(form));
  return data;
}

export async function deleteServerProduct(id) {
  await api.delete(`/api/admin-catalog/products/${id}/`);
}

export async function fetchAllergens() {
  return fetchAllPages("/api/allergens/");
}
