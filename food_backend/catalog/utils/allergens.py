from catalog.models import AllergenProduct

def get_allergens_for_product(product):
    """
    Возвращает список аллергенов, применимых к продукту,
    с приоритетом product > subtype > type.
    """
    qs = AllergenProduct.objects.select_related("allergen")

    # 1) точечно по продукту
    rules = list(qs.filter(scope="product", product_id=product.id))

    # 2) по подтипу
    if product.subtype_id:
        rules += list(qs.filter(scope="subtype", product_subtype_id=product.subtype_id))

        # 3) по типу
        pt_id = product.subtype.product_type_id
        rules += list(qs.filter(scope="type", product_type_id=pt_id))

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
