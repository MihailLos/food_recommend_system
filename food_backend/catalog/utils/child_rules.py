from catalog.models import NotChildProduct

def pick_not_child_rule(product):
    """
    Возвращает (rule, level) где level: 'product'|'subtype'|'type'|'none'
    Приоритет: product > subtype > type.
    """
    # 1) точечно по продукту
    rule = NotChildProduct.objects.filter(scope="product", product_id=product.id).first()
    if rule:
        return rule, "product"

    # 2) по подтипу
    if getattr(product, "subtype_id", None):
        rule = NotChildProduct.objects.filter(
            scope="subtype",
            product_subtype_id=product.subtype_id,
            product_id__isnull=True
        ).first()
        if rule:
            return rule, "subtype"

        # 3) по типу
        # если subtype связана с type через FK
        pt_id = product.subtype.product_type_id
        rule = NotChildProduct.objects.filter(
            scope="type",
            product_type_id=pt_id,
            product_subtype_id__isnull=True,
            product_id__isnull=True
        ).first()
        if rule:
            return rule, "type"

    return None, "none"
