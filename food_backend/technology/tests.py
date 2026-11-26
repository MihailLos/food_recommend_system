from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from .reference_comparison import DRY_LOSS_FIELDS, calculate_reference


def rule(**values):
    return SimpleNamespace(**{**dict.fromkeys(("weight", *DRY_LOSS_FIELDS)), **values})


class ReferenceComparisonTests(SimpleTestCase):
    def setUp(self):
        self.product = SimpleNamespace(name="Морковь", is_complex=False)
        self.preparation = SimpleNamespace(pk=1, name="Мойка и очистка")
        self.heating = SimpleNamespace(pk=2, name="Тепловая обработка")

    def test_washing_subtracts_vitamin_c_when_weight_coefficient_is_empty(self):
        result = calculate_reference(
            self.product, {"water": {Decimal(88)}, "c": {Decimal("0.005")}},
            (self.preparation,), {1: rule(c=30, water=10, energy_value=90)},
        )
        self.assertIsNone(result["reason"])
        self.assertEqual(result["reference_pct"], Decimal("11.9985"))

    def test_intermediate_stage_without_rule_is_skipped_and_all_dry_losses_are_used(self):
        grams = {
            "water": "86", "proteins": "1.4", "fats": "0.2", "carbs": "8.2", "ash": "1.0",
            "na": ".004", "k": ".175", "ca": ".031", "mg": ".014", "p": ".058", "fe": ".0008",
            "beta_carotene": "0", "b1": ".00005", "b2": ".00002", "pp": ".0002", "c": ".01",
        }
        heating_rule = rule(
            weight=35, water=43, proteins=2, fats=10, carbs=3, dietary_fiber=0, organic_acids=0, ash=3,
            na=6, k=3, ca=2, mg=3, p=2, fe=2, beta_carotene=10, b1=30, b2=25, pp=25, c=50, energy_value=9,
        )
        result = calculate_reference(
            self.product, {key: {Decimal(value)} for key, value in grams.items()},
            (self.preparation, self.heating), {1: None, 2: heating_rule},
        )
        self.assertIsNone(result["reason"])
        self.assertEqual(result["reference_pct"].quantize(Decimal("0.01")), Decimal("21.02"))
        self.assertEqual((result["reference_pct"] * Decimal(".65")).quantize(Decimal(".000001")), Decimal("13.663224"))
        self.assertEqual(result["skipped_steps"], [self.preparation.name])
        self.assertEqual(result["applied_steps"], [self.heating.name])

    def test_later_losses_apply_to_the_amount_left_from_the_first_stage(self):
        result = calculate_reference(
            self.product, {"water": {Decimal(88)}, "carbs": {Decimal(8)}},
            (self.preparation, self.heating), {1: rule(weight=20, carbs=50), 2: rule(weight=25, carbs=50)},
        )
        self.assertEqual(result["reference_pct"], Decimal(10))

    def test_final_stage_without_a_reference_rule_cannot_be_compared(self):
        result = calculate_reference(self.product, {"water": {Decimal(88)}}, (self.preparation,), {1: None})
        self.assertIsNone(result["reference_pct"])
        self.assertIn("нет справочного правила", result["reason"])
