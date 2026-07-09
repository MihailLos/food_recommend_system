from __future__ import annotations

import re
from typing import Dict, List

from django.db.models import Prefetch

from catalog.models import (
    FoodAdditive,
    FoodProductSubtypes,
    FoodProductTypes,
    FoodProducts,
)


def normalize_retail_text(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("ё", "е")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\bе[\s\-]?(\d{3,4})\b", r"e\1", text)
    return text


def tokenize_retail_text(value: str) -> List[str]:
    return [token for token in re.split(r"[^a-zA-Zа-яА-Я0-9]+", normalize_retail_text(value)) if token]


def _score_by_token_overlap(source: str, candidate: str) -> float:
    source_tokens = set(tokenize_retail_text(source))
    candidate_tokens = set(tokenize_retail_text(candidate))
    if not source_tokens or not candidate_tokens:
        return 0.0
    intersection = len(source_tokens & candidate_tokens)
    union = len(source_tokens | candidate_tokens)
    return round(intersection / union, 4) if union else 0.0


def _best_match(objects, query: str, label_getter) -> Dict | None:
    best = None
    best_score = 0.0
    for obj in objects:
        score = _score_by_token_overlap(query, label_getter(obj))
        if normalize_retail_text(query) in normalize_retail_text(label_getter(obj)):
            score = max(score, 0.75)
        if score > best_score:
            best_score = score
            best = obj
    if best is None or best_score <= 0:
        return None
    return {"object": best, "confidence": min(best_score, 0.99)}


def match_retail_name(name: str) -> dict:
    query = normalize_retail_text(name)
    groups = list(FoodProductTypes.objects.all().order_by("id"))
    subgroups = list(FoodProductSubtypes.objects.select_related("product_type").all().order_by("id"))
    products = list(FoodProducts.objects.select_related("subtype", "subtype__product_type").all().order_by("id"))

    group_match = _best_match(groups, query, lambda obj: obj.name)
    subgroup_match = _best_match(subgroups, query, lambda obj: obj.name)
    product_match = _best_match(products, query, lambda obj: obj.name)

    return {
        "normalized_name": query,
        "suggested_group": None if group_match is None else {
            "id": group_match["object"].id,
            "name": group_match["object"].name,
            "confidence": group_match["confidence"],
        },
        "suggested_subgroup": None if subgroup_match is None else {
            "id": subgroup_match["object"].id,
            "name": subgroup_match["object"].name,
            "confidence": subgroup_match["confidence"],
        },
        "suggested_product": None if product_match is None else {
            "id": product_match["object"].id,
            "name": product_match["object"].name,
            "confidence": product_match["confidence"],
        },
    }


def _split_composition_parts(composition_text: str) -> List[str]:
    parts = re.split(r"[;,]", composition_text or "")
    return [part.strip() for part in parts if part.strip()]


def match_retail_composition(composition_text: str) -> dict:
    normalized = normalize_retail_text(composition_text)
    parts = _split_composition_parts(normalized)

    products = list(FoodProducts.objects.select_related("subtype", "subtype__product_type").all().order_by("id"))
    additives = list(FoodAdditive.objects.select_related("group").all().order_by("id"))

    components: List[dict] = []
    found_product_ids = set()
    additive_links: List[dict] = []
    found_additive_ids = set()

    for index, part in enumerate(parts, start=1):
        best_product = _best_match(products, part, lambda obj: obj.name)
        if best_product is not None and best_product["object"].id not in found_product_ids and best_product["confidence"] >= 0.34:
            found_product_ids.add(best_product["object"].id)
            components.append({
                "food_component_id": best_product["object"].id,
                "food_component_name": best_product["object"].name,
                "component_text": part,
                "position_index": index,
                "match_confidence": best_product["confidence"],
                "matched_by": "auto",
            })

        additive_match = None
        additive_score = 0.0
        additive_code_match = re.search(r"\be\d{3,4}\b", part)
        for additive in additives:
            score = 0.0
            normalized_name = normalize_retail_text(additive.name)
            if additive.code and normalize_retail_text(additive.code) in part:
                score = 0.99
            elif additive_code_match and additive.code and normalize_retail_text(additive.code) == additive_code_match.group(0):
                score = 0.99
            elif normalized_name and normalized_name in part:
                score = 0.8
            else:
                score = _score_by_token_overlap(part, additive.name)
            if score > additive_score:
                additive_score = score
                additive_match = additive
        if additive_match is not None and additive_match.id not in found_additive_ids and additive_score >= 0.4:
            found_additive_ids.add(additive_match.id)
            additive_links.append({
                "food_additive_id": additive_match.id,
                "food_additive_code": additive_match.code,
                "food_additive_name": additive_match.name,
                "additive_text": part,
                "position_index": index,
                "match_confidence": min(additive_score, 0.99),
                "matched_by": "auto",
            })

    return {
        "normalized_composition_text": normalized,
        "components": components,
        "additives": additive_links,
    }
