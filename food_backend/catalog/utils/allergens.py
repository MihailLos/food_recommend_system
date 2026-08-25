from collections import defaultdict

from catalog.models import AllergenProduct


def build_allergen_rule_cache():
    """Загружает правила один раз для пакетной сериализации продуктов."""
    rules_by_scope = {
        "product": defaultdict(list),
        "subtype": defaultdict(list),
        "type": defaultdict(list),
    }
    for rule in AllergenProduct.objects.select_related("allergen").all():
        if rule.scope == AllergenProduct.SCOPE_PRODUCT and rule.product_id:
            rules_by_scope["product"][rule.product_id].append(rule)
        elif rule.scope == AllergenProduct.SCOPE_SUBTYPE and rule.product_subtype_id:
            rules_by_scope["subtype"][rule.product_subtype_id].append(rule)
        elif rule.scope == AllergenProduct.SCOPE_TYPE and rule.product_type_id:
            rules_by_scope["type"][rule.product_type_id].append(rule)
    return rules_by_scope


def get_allergens_for_product(product, rule_cache=None):
    """
    Возвращает список аллергенов, применимых к продукту,
    с приоритетом product > subtype > type.
    """
    if rule_cache is None:
        qs = AllergenProduct.objects.select_related("allergen")
        rules = list(qs.filter(scope="product", product_id=product.id))
        if product.subtype_id:
            rules += list(qs.filter(scope="subtype", product_subtype_id=product.subtype_id))
            rules += list(qs.filter(scope="type", product_type_id=product.subtype.product_type_id))
    else:
        rules = list(rule_cache["product"].get(product.id, []))
        if product.subtype_id:
            rules += list(rule_cache["subtype"].get(product.subtype_id, []))
            rules += list(rule_cache["type"].get(product.subtype.product_type_id, []))

    # дедуп по аллергену
    seen = set()
    out = []
    for r in rules:
        if r.allergen_id in seen:
            continue
        seen.add(r.allergen_id)
        out.append({
            "id": r.allergen.id,
            "name": r.allergen.name,
            "scope": r.scope
        })
    return out
