"""Load the reviewed initial dataset; dry-run unless --apply is supplied."""
import json
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, models, transaction
from technology.models import (
    RawMaterialBatch, ExperimentSeries, ExperimentSample, TechnologicalExperiment,
    DryMatterMeasurement, ProcessingType,
)


class Command(BaseCommand):
    help = "Load reviewed potato/carrot experiments; default is transaction rollback."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Commit the dataset")

    def handle(self, *args, **options):
        path = Path(__file__).resolve().parents[2] / "data" / "initial_experiments.json"
        data = json.loads(path.read_text())
        counters = Counter()

        def ensure(model, lookup, values):
            obj, created = model.objects.get_or_create(**lookup, defaults=values)
            if not created:
                for key, expected in values.items():
                    field = model._meta.get_field(key)
                    if isinstance(field, models.ForeignKey):
                        actual, wanted = getattr(obj, field.attname), expected.pk if expected else None
                    else:
                        actual, wanted = getattr(obj, key), field.to_python(expected)
                    if actual != wanted:
                        raise CommandError(f"Conflict in {model._meta.db_table} {lookup}, field {key}: {actual!r} != {wanted!r}. No rows overwritten.")
            counters[(model._meta.db_table, "created" if created else "unchanged")] += 1
            return obj

        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout = '5s'")
                cursor.execute("SET LOCAL statement_timeout = '30s'")
                cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [data["dataset"]])
                cursor.execute('LOCK TABLE "Culinary_Processing_Types" IN SHARE ROW EXCLUSIVE MODE')
            types = {}
            for name in sorted({r["processing"] for r in data["experiments"]}):
                found = list(ProcessingType.objects.filter(name=name))
                if len(found) > 1:
                    raise CommandError(f"Ambiguous processing name: {name}")
                if found:
                    types[name] = found[0]
                elif name == "Запекание целого очищенного картофеля":
                    # Use the database sequence, never a guessed or hardcoded ID.
                    with connection.cursor() as cursor:
                        for _ in range(10000):
                            cursor.execute('INSERT INTO "Culinary_Processing_Types" ("Name") VALUES (%s) ON CONFLICT ("ID") DO NOTHING RETURNING "ID"', [name])
                            row = cursor.fetchone()
                            if row:
                                types[name] = ProcessingType.objects.get(pk=row[0])
                                counters[("Culinary_Processing_Types", "created")] += 1
                                break
                        else:
                            raise CommandError("Processing dictionary sequence cannot allocate an ID")
                else:
                    raise CommandError(f"Missing processing type: {name}")

            batches = {}
            samples = {}
            for row in data["batches"]:
                row = dict(row)
                code = row.pop("code")
                batches[code] = ensure(RawMaterialBatch, {"code": code}, row)
                raw_code = code.removesuffix("-01") + "-RAW"
                potato = code.startswith("POT-")
                samples[raw_code] = ensure(ExperimentSample, {"code": raw_code}, {
                    "batch": batches[code], "sample_state": "before_processing",
                    "selection_date": "2026-10-09" if potato else None,
                    "source_reference": data["sources"]["old" if potato else "carrot"],
                    "notes": "Исходный анализ той же партии используется для варки и запекания; подтверждено пользователем. Дата запекания и условия хранения неизвестны." if potato else "Отдельная порция той же партии для анализа сырого продукта; подтверждено пользователем.",
                })

            for row in data["experiments"]:
                row = dict(row)
                code, batch_code, processing, source = (row.pop(k) for k in ["code", "batch", "processing", "source"])
                old = source.startswith("таблица-")
                source_ref = data["sources"].get(source, source)
                series = ensure(ExperimentSeries, {"code": "S-" + code}, {
                    "title": code, "description": "Один зарегистрированный самостоятельный опыт. Серия не подтверждает наличие независимых повторов.",
                })
                after_code = code + "-S"
                samples[after_code] = ensure(ExperimentSample, {"code": after_code}, {
                    "batch": batches[batch_code], "sample_state": "after_processing",
                    "selection_date": "2026-10-09" if old else None,
                    "source_reference": source_ref,
                })
                note = row.pop("notes", "")
                if source == "potato":
                    note += " Отдельная порция для варианта с/без фольги; подтверждено пользователем. Массы отнесены к продукту согласно согласованной таблице. В источнике перечислены пароконвектомат, жарочный шкаф и эксикатор; конкретное оборудование запекания не установлено. Знаки '-' для воды/масла оставлены NULL."
                row.update({
                    "batch": batches[batch_code], "series": series, "replicate_number": 1,
                    "processing_type": types[processing],
                    "before_sample": samples[batch_code.removesuffix("-01") + "-RAW"],
                    "after_sample": samples[after_code],
                    "preparation_description": "Мойка, очистка",
                    "cutting_shape": "Целые очищенные клубни" if batch_code.startswith("POT-") else "Целая очищенная морковь",
                    "notes": f"Источник: {source_ref}. {note.strip()}",
                })
                ensure(TechnologicalExperiment, {"code": code}, row)

            for sample_code, values in data["reported_measurements"].items():
                for i, value in enumerate(values, 1):
                    ensure(DryMatterMeasurement, {"sample": samples[sample_code], "laboratory_parallel_number": i}, {
                        "reported_dry_matter_pct": value, "analysis_date": "2026-10-09",
                        "source_reference": data["sources"]["old"], "excluded_from_analysis": False,
                        "notes": "Готовый результат лаборатории. m0 отсутствует; первичные взвешивания не восстановлены из процентов. Промежуточные массы сохранены в исходном документе.",
                    })
            for sample_code, rows in data["mass_measurements"].items():
                source = "potato" if sample_code.startswith("POT-") else "carrot"
                for i, values in enumerate(rows, 1):
                    payload = dict(zip(data["mass_columns"], values, strict=True))
                    payload.update({"source_reference": data["sources"][source], "excluded_from_analysis": False,
                        "notes": "Сообщённый процент сохранён без изменения; расчёт по массам выполняется представлением."})
                    if sample_code == "CAR-OMS-RAW" and i == 2:
                        payload["notes"] += " Пользователь подтвердил верность вычислений. Значение 8,36% сохранено; допустимость разброса по методике отдельно не подтверждена."
                    ensure(DryMatterMeasurement, {"sample": samples[sample_code], "laboratory_parallel_number": i}, payload)

            codes = [r["code"] for r in data["experiments"]]
            with connection.cursor() as cursor:
                cursor.execute("SELECT experiment_code, round(product_output_pct,4), round(true_retention_pct,4) FROM v_experiment_dry_matter_results WHERE experiment_code = ANY(%s) ORDER BY experiment_code", [codes])
                results = cursor.fetchall()
                if len(results) != 11 or any(r[1] is None or r[2] is None for r in results):
                    raise CommandError("Incomplete experiment calculations; import rolled back")
                cursor.execute("SELECT count(*) FROM dry_matter_measurements WHERE sample_id = ANY(%s)", [[s.pk for s in samples.values()]])
                if cursor.fetchone()[0] != 48:
                    raise CommandError("Expected exactly 48 measurements in imported samples")
            for code, output, retention in results:
                self.stdout.write(f"{code}: output={output}% retention={retention}%")
            for (table, action), count in sorted(counters.items()):
                self.stdout.write(f"{table}: {action}={count}")
            if not options["apply"]:
                transaction.set_rollback(True)
                self.stdout.write("DRY RUN: rolled back (sequence gaps are possible). Use --apply to commit.")
            else:
                self.stdout.write("APPLIED: all records committed when transaction completes.")
