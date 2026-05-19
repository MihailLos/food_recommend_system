/** Аккуратно взять первое существующее поле из набора ключей */
const pick = (obj, ...keys) => {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null) return v;
  }
  return null;
};

/** Привести сырой объект продукта с бэка к плоскому виду для таблицы */
export function normalizeProduct(p) {
  const m = p.macros || {};
  const min = p.minerals || {};
  const vit = p.vitamins || {};
  const fa = p.fat_acids || {};
  const other = p.other_nutrients || {};

  return {
    id: p.id,
    name: p.name,
    typeId: p.type?.id ?? p.type,
    typeName: p.type?.name ?? `Группа #${p.type ?? "?"}`,
    subtypeId: p.subtype?.id ?? p.subtype,
    subtypeName: p.subtype?.name ?? `Подгруппа #${p.subtype ?? "?"}`,
    isComplex: !!p.is_complex,
    isAllergen: Boolean(p.is_allergen),
    isChildAllowed: Boolean(p.is_child_allowed),
    allergens: Array.isArray(p.allergens) ? p.allergens : [],
    childRestrictionLevel: p.child_restriction_level ?? null,

    protein_g:        pick(m, "protein_g", "Protein (g)"),
    fats_g:           pick(m, "fats_g", "Fats (g)"),
    carbs_g:          pick(m, "carbs_g", "Carbs (g)"),
    energy_kcal:      pick(m, "energy_kcal", "Energy_Value (kcal)"),
    fiber_g:          pick(m, "dietary_fiber_g", "Dietary_Fiber (g)"),
    dietary_fiber_g:  pick(m, "dietary_fiber_g", "Dietary_Fiber (g)"),
    mds_g:            pick(m, "mds_g", "MDS (g)"),
    starch_g:         pick(m, "starch_g", "Starch (g)"),
    water_g:          pick(m, "water_g", "Water (g)"),

    na_mg:            pick(min, "na_mg", "Na (mg)"),
    k_mg:             pick(min, "k_mg", "K (mg)"),
    ca_mg:            pick(min, "ca_mg", "Ca (mg)"),
    mg_mg:            pick(min, "mg_mg", "Mg (mg)"),
    p_mg:             pick(min, "p_mg", "P (mg)"),
    fe_mg:            pick(min, "fe_mg", "Fe (mg)"),
    ash_g:            pick(min, "ash_g", "Ash (g)"),

    a_mg:             pick(vit, "a_mg", "A_Vitamin (mg)"),
    beta_carotene_mg: pick(vit, "beta_carotene_mg", "Beta_Carotene (mg)"),
    b1_mg:            pick(vit, "b1_mg", "B1_Vitamin (mg)"),
    b2_mg:            pick(vit, "b2_mg", "B2_Vitamin (mg)"),
    pp_mg:            pick(vit, "pp_mg", "PP_Vitamin (mg)"),
    c_mg:             pick(vit, "c_mg", "C_Vitamin (mg)"),
    retinol_index:    pick(vit, "retinol_index", "Retinol_Index"),
    tocopherol_index: pick(vit, "tocopherol_index", "Tocopherol_Index"),
    niacin_index:     pick(vit, "niacin_index", "Niacin_Index"),

    nlc_g:            pick(fa, "nlc_g", "NLC (g)"),
    pufa_g:           pick(fa, "pufa_g", "PUFA (g)"),
    cholesterol_g:    pick(fa, "cholesterol_g", "cholesterol_mg", "Cholesterin (g)"),

    organic_acids_g:  pick(other, "organic_acids_g", "Organic_Acids (g)"),
    alcohol_pct:      pick(other, "alcohol_pct", "Alcohol (pct)"),
  };
}
