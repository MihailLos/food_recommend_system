from catalog.models import NotChildProduct


def build_not_child_rule_cache():
    """Загружает правила один раз для пакетной сериализации продуктов."""
    rules_by_scope = {"product": {}, "subtype": {}, "type": {}}
    for rule in NotChildProduct.objects.all():
        if rule.scope == NotChildProduct.SCOPE_PRODUCT and rule.product_id:
            rules_by_scope["product"].setdefault(rule.product_id, rule)
        elif rule.scope == NotChildProduct.SCOPE_SUBTYPE and rule.product_subtype_id and not rule.product_id:
            rules_by_scope["subtype"].setdefault(rule.product_subtype_id, rule)
        elif rule.scope == NotChildProduct.SCOPE_TYPE and rule.product_type_id and not rule.product_subtype_id and not rule.product_id:
            rules_by_scope["type"].setdefault(rule.product_type_id, rule)
    return rules_by_scope


def pick_not_child_rule(product, rule_cache=None):
    """
    Возвращает (rule, level) где level: 'product'|'subtype'|'type'|'none'
    Приоритет: product > subtype > type.
    """
    # 1) точечно по продукту
    rule = (
        rule_cache["product"].get(product.id)
        if rule_cache is not None
        else NotChildProduct.objects.filter(scope="product", product_id=product.id).first()
    )
    if rule:
        return rule, "product"

    # 2) по подтипу
    if getattr(product, "subtype_id", None):
        rule = (
            rule_cache["subtype"].get(product.subtype_id)
            if rule_cache is not None
            else NotChildProduct.objects.filter(
                scope="subtype", product_subtype_id=product.subtype_id, product_id__isnull=True
            ).first()
        )
        if rule:
            return rule, "subtype"

        # 3) по типу
        # если subtype связана с type через FK
        pt_id = product.subtype.product_type_id
        rule = (
            rule_cache["type"].get(pt_id)
            if rule_cache is not None
            else NotChildProduct.objects.filter(
                scope="type", product_type_id=pt_id,
                product_subtype_id__isnull=True, product_id__isnull=True
            ).first()
        )
        if rule:
            return rule, "type"

    return None, "none"
