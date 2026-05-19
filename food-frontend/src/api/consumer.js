// src/api/consumer.js
import client from "./client";

// Профили
export async function fetchProfiles() {
  return client.get("/api/consumer/profiles/").then(r => r.data);
}
export async function fetchProfile(id) {
  return client.get(`/api/consumer/profiles/${id}/`).then(r => r.data);
}
export async function createProfile(payload) {
  return client.post("/api/consumer/profiles/", payload).then(r => r.data);
}
export async function updateProfile(id, payload) {
  return client.put(`/api/consumer/profiles/${id}/`, payload).then(r => r.data);
}
export async function deleteProfile(id) {
  return client.delete(`/api/consumer/profiles/${id}/`).then(r => r.data);
}

// Справочники
export async function fetchWorkGroups() {
  return client.get("/api/work-activity-groups/").then(r => r.data);
}
export async function fetchAllergens() {
  return client.get("/api/allergens/").then(r => r.data);
}

// Расчёт энерготрат (опционально, если хочешь дергать отдельно)
export async function fetchProfileEnergy(id) {
  return client.get(`/api/consumer/profiles/${id}/energy/`).then(r => r.data);
}

export async function fetchActiveProfile() {
    return client.get("/api/consumer/profiles/active/").then(r => r.data);
}

export async function setActiveProfile(id, payload) {
    return client.post(`/api/consumer/profiles/${id}/set-active/`, payload).then(r => r.data);
}

// goals
export async function fetchGoals(profileId) {
  return client.get(`/api/consumer/goals/?profile=${profileId}`).then(r => r.data);
}

export async function createGoal(payload) {
  return client.post(`/api/consumer/goals/`, payload).then(r => r.data);
}

export async function updateGoal(id, payload) {
  return client.put(`/api/consumer/goals/${id}/`, payload).then(r => r.data);
}

export async function deleteGoal(id) {
  return client.delete(`/api/consumer/goals/${id}/`).then(r => r.data);
}

export async function fetchActiveGoal(profileId) {
  return client.get(`/api/consumer/goals/active/?profile=${profileId}`).then(r => r.data);
}

export async function setActiveGoal(id) {
  return client.post(`/api/consumer/goals/${id}/set-active/`).then(r => r.data);
}

// targets
export async function fetchProfileTargets(profileId) {
  return client.get(`/api/consumer/profiles/${profileId}/targets/`).then(r => r.data);
}

// preferences (если будете редактировать отдельно)
export async function fetchGoalPreferences(goalId) {
  return client.get(`/api/consumer/goals/${goalId}/preferences/`).then(r => r.data);
}

export async function replaceGoalPreferences(goalId, prefsList) {
  return client.put(`/api/consumer/goals/${goalId}/preferences/`, prefsList).then(r => r.data);
}

export async function fetchNutrientsDictionary() {
  return client.get(`/api/nutrients-dictionary/`).then(r => r.data);
}

export async function fetchFoodProductTypes() {
  return client.get("/api/types/").then((r) => r.data);
}

export async function fetchFoodProductSubtypes() {
  return client.get("/api/subtypes/").then((r) => r.data);
}

export async function fetchRecommendations({
  profileId,
  mode = "catalog",
  comparisonMode = "subgroup",
  cartId = null,
  limit = 50,
  q = "",
  typeId = null,
  subtypeId = null,
  localProducts = null,
}) {
  const pid = Number(profileId);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error("profileId is required");
  }

  const payload = {
    profile: pid,
    mode: String(mode),
    comparison_mode: String(comparisonMode || "subgroup"),
    limit,
  };

  if (mode === "cart" && cartId != null) {
    payload.cart = String(cartId);
  }

  if (mode === "catalog") {
    const search = String(q || "").trim();
    if (search) {
      payload.q = search;
    }
    if (typeId != null && String(typeId).trim() !== "") {
      payload.type_id = String(typeId);
    }
    if (subtypeId != null && String(subtypeId).trim() !== "") {
      payload.subtype_id = String(subtypeId);
    }
  }

  if (Array.isArray(localProducts) && localProducts.length > 0) {
    payload.local_products = localProducts;
  }

  return client.post(`/api/consumer/recommendations/`, payload).then((r) => r.data);
}
