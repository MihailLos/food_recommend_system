import React, { useId, useRef, useState } from "react";
import { createTechnologyRecord, updateTechnologyRecord } from "../../api/technology";
import { batchName, BatchPicker, CatalogPicker, Choice, Field, ProcessingPicker, SelectOptions } from "./TechnologyFields";
import { formatCalculatedPercent, formatNumber } from "./technologyFormat";
import { initialRecordForm } from "./technologyRecordForm";

const stages = [
  { id: "raw", name: "Без обработки" },
  { id: "preprocessed", name: "После первичной обработки" },
  { id: "processed", name: "После тепловой обработки" },
];

const masses = [
  ["m0_g", "Тара m₀, г"],
  ["m1_g", "Бюкс с навеской до сушки m₁, г"],
  ["m2_g", "Бюкс с навеской после сушки m₂, г"],
];
const oilFreeMasses = masses.map(([key]) => key.replace("_g", "_without_oil_g"));
const oilFreeResidue = "reported_dry_residue_without_oil_g";
const oilFreePercent = "reported_dry_matter_without_oil_pct";

function validationMessages(value, path = "", messages = {}) {
  if (typeof value === "string") {
    messages[path] = value;
  } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    if (value.length) messages[path] = value.join(" ");
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      validationMessages(entry, path ? `${path}.${key}` : key, messages);
    });
  }
  return messages;
}

function buildPayload(form, { batch, manual, preprocessing, heating, analyze, resultMode, parallels, oilUsed, showOilResults, record }) {
  const fields = new FormData(form);
  const field = (name) => String(fields.get(name) ?? "").trim();
  const decimal = (name) => field(name).replace(",", ".") || null;

  const payload = { weight_g: decimal("weight_g") };
  if (record) payload.edit_version = record.edit_version;
  if (batch) {
    payload.batch_id = batch.id;
  } else {
    payload.batch = {
      product_name: field("batch.product_name"),
      sort_name: field("batch.sort_name") || null,
      source_place: field("batch.source_place") || null,
      acquisition_date: field("batch.acquisition_date") || null,
      manual: manual?.id ?? null,
    };
  }
  if (preprocessing) {
    payload.preprocessing = {
      cpt: Number(field("preprocessing.cpt")),
      weight_g: decimal("preprocessing.weight_g"),
      is_cut: fields.has("preprocessing.is_cut"),
    };
  }
  if (heating) {
    payload.heating = {
      cpt: Number(field("heating.cpt")),
      weight_g: decimal("heating.weight_g"),
      processing_temperature_celsius: decimal("heating.processing_temperature_celsius"),
      added_water_g: decimal("heating.added_water_g"),
      added_oil_g: decimal("heating.added_oil_g"),
    };
    if (oilUsed) payload.heating.oil_used = true;
    else if (record && initialRecordForm(record).heating?.oil_used != null) payload.heating.oil_used = false;
  }
  if (analyze) {
    payload.analysis = { stage: field("analysis.stage"), result_mode: resultMode };
    if (showOilResults) payload.analysis[oilFreePercent] = decimal(`analysis.${oilFreePercent}`);
    if (resultMode === "reported") {
      payload.analysis.reported_dry_matter_pct = decimal("analysis.reported_dry_matter_pct");
    } else {
      payload.analysis.parallels = parallels.map((row, index) => {
        const keys = masses.map(([key]) => key);
        if (showOilResults) keys.push(...oilFreeMasses, oilFreeResidue, oilFreePercent);
        const values = Object.fromEntries(keys.map((key) => [key, decimal(`analysis.parallels.${index}.${key}`)]));
        if (row.parallel_number != null) values.parallel_number = row.parallel_number;
        return values;
      });
    }
  }
  return payload;
}

function calculateParallel(row, keys = masses.map(([key]) => key)) {
  const values = keys.map((key) => row[key]?.trim().replace(",", "."));
  if (!values.every((value) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value ?? ""))) return null;
  const [m0, m1, m2] = values.map(Number);
  if (![m0, m1, m2].every(Number.isFinite) || m0 < 0 || m1 <= m0 || m2 < m0 || m2 > m1) return null;
  return { residue: m2 - m0, percent: (m2 - m0) * 100 / (m1 - m0) };
}

function Weighings({ rows, onEdit, onAdd, onRemove, errors, showOilResults }) {
  const results = rows.map((row) => calculateParallel(row));
  const average = (key) => results.reduce((total, row) => total + row[key], 0) / results.length;
  return (
    <div className="technology-stack">
      {rows.map((row, index) => {
        const path = `analysis.parallels.${index}`;
        const hasOilFreeMass = oilFreeMasses.some((key) => row[key]?.trim());
        const corrected = calculateParallel(row, oilFreeMasses);
        return (
          <fieldset className="technology-subsection" key={row.id}>
            <legend>Параллель {row.parallel_number ?? index + 1}</legend>
            <div className="technology-grid technology-grid-three">
              {masses.map(([key, label], massIndex) => (
                <div className="technology-stack" key={key}>
                  <Field name={`${path}.${key}`} label={label} hint={showOilResults ? "С учётом масла в навеске" : undefined}
                    required inputMode="decimal" value={row[key] ?? ""}
                    onChange={(event) => onEdit(row.id, key, event.target.value)} error={errors[`${path}.${key}`]} />
                  {showOilResults && <Field name={`${path}.${oilFreeMasses[massIndex]}`}
                    label={`${label} (без учёта масла)`} hint="Необязательно" inputMode="decimal"
                    value={row[oilFreeMasses[massIndex]] ?? ""}
                    onChange={(event) => onEdit(row.id, oilFreeMasses[massIndex], event.target.value)}
                    error={errors[`${path}.${oilFreeMasses[massIndex]}`]} />}
                </div>
              ))}
            </div>
            <div className="technology-actions">
              {results[index] && <span>{showOilResults && "С учётом масла · "}Сухой остаток {formatNumber(results[index].residue)} г · {formatCalculatedPercent(results[index].percent, " %")}</span>}
              {rows.length > 1 && <button type="button" onClick={() => onRemove(row.id)}
                aria-label={`Убрать параллель ${index + 1}`}>Убрать</button>}
            </div>
            {showOilResults && (hasOilFreeMass ? (
              <p>{corrected
                ? `Без учёта масла · Сухой остаток ${formatNumber(corrected.residue)} г · ${formatCalculatedPercent(corrected.percent, " %")}`
                : "Для расчёта без учёта масла заполните все три массы."}</p>
            ) : (
              <div className="technology-grid">
                {[[oilFreeResidue, "Сухой остаток без учёта масла, г"], [oilFreePercent, "Массовая доля без учёта масла, %"]]
                  .map(([key, label]) => <Field key={key} name={`${path}.${key}`} label={label} hint="Вручную, если известно"
                    inputMode="decimal" value={row[key] ?? ""} onChange={(event) => onEdit(row.id, key, event.target.value)}
                    error={errors[`${path}.${key}`]} />)}
              </div>
            ))}
          </fieldset>
        );
      })}
      <div>
        <button type="button" name="analysis.parallels" onClick={onAdd}>+ Добавить параллель</button>
        {errors["analysis.parallels"] && <p className="technology-error">{errors["analysis.parallels"]}</p>}
      </div>
      {results.every(Boolean) && (
        <p>{showOilResults && "С учётом масла · "}Средний сухой остаток {formatNumber(average("residue"))} г · Сухие вещества {formatCalculatedPercent(average("percent"), " %")}</p>
      )}
    </div>
  );
}

export default function TechnologyEntry({ options, onProcessingTypeAdded, onSaved, record, onCancel }) {
  const initial = initialRecordForm(record);
  const [batchMode, setBatchMode] = useState("new");
  const [batch, setBatch] = useState(null);
  const [editBatch, setEditBatch] = useState(false);
  const [manual, setManual] = useState(() => record?.batch.manual
    ? { id: record.batch.manual, name: record.batch.manual_name } : null);
  const [preprocessing, setPreprocessing] = useState(Boolean(initial.prep));
  const [heating, setHeating] = useState(Boolean(initial.heating));
  const [oilUsed, setOilUsed] = useState(Boolean(initial.heating?.uses_oil));
  const [addedOil, setAddedOil] = useState(initial.heating?.added_oil_g ?? "");
  const [analyze, setAnalyze] = useState(Boolean(initial.analysis));
  const [stage, setStage] = useState(initial.stage ?? "");
  const [resultMode, setResultMode] = useState(initial.analysis?.result_mode ?? "");
  const [parallels, setParallels] = useState(() => initial.analysis?.parallels?.length
    ? initial.analysis.parallels.map((row) => ({ ...row, id: row.parallel_number })) : [{ id: 0 }]);
  const nextParallel = useRef(Math.max(...parallels.map(({ id }) => id)) + 1);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const modeErrorId = useId();
  const usesOil = oilUsed || Number(addedOil.trim().replace(",", ".")) > 0;
  const showOilResults = heating && stage === "processed" && usesOil;
  const removesSavedData = record && (
    (initial.prep && !preprocessing) || (initial.heating && !heating)
    || (initial.analysis && !analyze)
    || (initial.analysis?.result_mode === "weighings" && resultMode === "reported")
    || (initial.heating?.uses_oil && initial.stage === "processed" && !showOilResults)
  );
  const selectedStages = stages.filter(({ id }) =>
    id === "raw" || (id === "preprocessed" && preprocessing) || (id === "processed" && heating),
  );

  const clearField = (name) => setErrors((current) => {
    if (!Object.keys(current).some((key) => key === name || key.startsWith(`${name}.`))) return current;
    return Object.fromEntries(Object.entries(current).filter(([key]) => key !== name && !key.startsWith(`${name}.`)));
  });

  const focusError = (form, messages) => {
    const invalid = [...form.elements].find((input) => Object.hasOwn(messages, input.name) && !input.disabled);
    if (invalid) {
      invalid.focus({ preventScroll: true });
      invalid.scrollIntoView?.({ block: "center" });
    }
    return Boolean(invalid);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const missing = {};
    for (const input of form.elements) {
      if (input.disabled || !input.required) continue;
      if (input.type === "radio" ? !resultMode : !input.value.trim()) {
        missing[input.name] = input.type === "radio" ? "Выберите способ получения результата." : "Заполните обязательное поле.";
      }
    }
    setFailure("");
    setErrors(missing);
    if (Object.keys(missing).length) {
      focusError(form, missing);
      return;
    }
    setSaving(true);
    try {
      const selectedBatch = record ? (editBatch ? null : record.batch) : (batchMode === "existing" ? batch : null);
      const payload = buildPayload(form, { batch: selectedBatch, manual, preprocessing,
        heating, analyze, resultMode, parallels, oilUsed: usesOil, showOilResults, record });
      if (record) await updateTechnologyRecord(record.id, payload);
      else await createTechnologyRecord(payload);
      onSaved();
    } catch (error) {
      const response = error.response;
      if (response?.status === 400) {
        const messages = validationMessages(response.data);
        setErrors(messages);
        if (!focusError(form, messages)) {
          setFailure(Object.values(messages).join(" ") || "Проверьте введённые данные.");
        }
      } else if (response?.status === 403) {
        setFailure("Нет доступа к сохранению. Проверьте, что вы вошли в систему под нужной учётной записью.");
      } else if (response?.status === 409) {
        setFailure(response.data.detail || "Запись уже изменилась. Откройте её заново.");
      } else {
        setFailure("Не удалось подтвердить сохранение. Перед повторной отправкой проверьте журнал.");
      }
    } finally {
      setSaving(false);
    }
  };

  const props = (name, label, extra) => ({ name, label, ...extra, error: errors[name] });
  const processingPicker = (name, label, initialValue) => (
    <ProcessingPicker name={name} label={label} error={errors[name]} items={options.processing_types}
      initialValue={initialValue}
      onAdded={(item) => { onProcessingTypeAdded(item); clearField(name); }} />
  );

  return (
    <form className="technology-stack" noValidate onSubmit={submit} onChange={(event) => clearField(event.target.name)}>
      <section className="technology-panel">
        <h2>Основные данные о продукте</h2>
        {record ? (
          <div>
            <p>{batchName(record.batch)}</p>
            <Choice type="checkbox" checked={editBatch} onChange={(event) => {
              setEditBatch(event.target.checked);
              clearField("batch");
            }}>Изменить сведения о партии во всех её записях</Choice>
          </div>
        ) : <div className="technology-actions" role="group" aria-label="Выбор партии">
          <Choice type="radio" name="batchMode" checked={batchMode === "new"}
            onChange={() => { setBatchMode("new"); clearField("batch_id"); }}>Новая партия</Choice>
          <Choice type="radio" name="batchMode" checked={batchMode === "existing"}
            onChange={() => { setBatchMode("existing"); clearField("batch"); }}>Существующая партия</Choice>
        </div>}
        {(record ? editBatch : batchMode === "new") && (
          <>
            <div className="technology-grid technology-new-batch">
              <Field {...props("batch.product_name", "Название продукта", { required: true, maxLength: 120, defaultValue: record?.batch.product_name })} />
              <Field {...props("batch.sort_name", "Сорт (разновидность продукта)", { hint: "Необязательно", defaultValue: record?.batch.sort_name ?? "" })} />
              <Field {...props("batch.source_place", "Происхождение (страна и/или город происхождения)", { hint: "Необязательно", defaultValue: record?.batch.source_place ?? "" })} />
              <Field {...props("batch.acquisition_date", "Дата приобретения", { hint: "Необязательно", type: "date", defaultValue: record?.batch.acquisition_date ?? "" })} />
            </div>
            <CatalogPicker groups={options.groups} subgroups={options.subgroups} value={manual} onChange={setManual}
              error={errors["batch.manual"]} />
          </>
        )}
        {!record && batchMode === "existing" && <BatchPicker value={batch} onChange={setBatch} error={errors.batch_id} />}
        <div className="technology-grid">
          <Field {...props("weight_g", "Масса до обработки, г", { required: true, inputMode: "decimal", defaultValue: record?.weight_g })} />
        </div>
      </section>

      <section className="technology-panel">
        <h2>Обработка</h2>
        <Choice type="checkbox" checked={preprocessing} onChange={(event) => {
          setPreprocessing(event.target.checked);
          if (!event.target.checked && stage === "preprocessed") setStage("");
          clearField("preprocessing");
        }}>Добавить первичную обработку</Choice>
        {preprocessing && (
          <div className="technology-grid">
            {processingPicker("preprocessing.cpt", "Вид первичной обработки", initial.prep?.cpt)}
            <Field {...props("preprocessing.weight_g", "Масса после первичной обработки, г", { required: true, inputMode: "decimal", defaultValue: initial.prep?.weight_g })} />
            <Choice type="checkbox" name="preprocessing.is_cut" defaultChecked={initial.prep?.is_cut}>Продукт нарезали</Choice>
          </div>
        )}
        <Choice type="checkbox" checked={heating} onChange={(event) => {
          setHeating(event.target.checked);
          if (!event.target.checked && stage === "processed") setStage("");
          clearField("heating");
        }}>Добавить тепловую обработку</Choice>
        {heating && (
          <div className="technology-grid">
            {processingPicker("heating.cpt", "Способ обработки", initial.heating?.cpt)}
            <Field {...props("heating.weight_g", "Масса после нагрева, г", { required: true, inputMode: "decimal", defaultValue: initial.heating?.weight_g })} />
            <Field {...props("heating.processing_temperature_celsius", "Температура среды при закладке, °C", { hint: "Если известно", inputMode: "decimal", defaultValue: initial.heating?.processing_temperature_celsius ?? "" })} />
            <Field {...props("heating.added_water_g", "Добавлено воды, г", { hint: "Если известно", inputMode: "decimal", defaultValue: initial.heating?.added_water_g ?? "" })} />
            <Field {...props("heating.added_oil_g", "Добавлено масла, г", { hint: "Если известно", inputMode: "decimal",
              value: addedOil, onChange: (event) => setAddedOil(event.target.value) })} />
            <Choice type="checkbox" checked={usesOil} onChange={(event) => {
              setOilUsed(event.target.checked);
              if (!event.target.checked) setAddedOil("");
              clearField("analysis");
            }}>При обработке использовали масло</Choice>
          </div>
        )}
      </section>

      <section className="technology-panel">
        <h2>Сухие вещества</h2>
        <Choice type="checkbox" checked={analyze} onChange={(event) => {
          setAnalyze(event.target.checked);
          clearField("analysis");
        }}>Добавить лабораторный анализ</Choice>
        {analyze && (
          <>
            <div className="technology-grid">
              <Field {...props("analysis.stage", "После какого вида обработки проводилось исследование?", {
                required: true, value: stage, onChange: (event) => setStage(event.target.value),
                options: <SelectOptions items={selectedStages} placeholder="Выберите стадию" />,
              })} />
            </div>
            <fieldset className="technology-subsection">
              <legend>Как получен результат? <span className="technology-required" aria-hidden="true">*</span></legend>
              <div className="technology-actions">
                {[
                  ["reported", "Внести готовый процент"],
                  ["weighings", "Рассчитать по взвешиваниям"],
                ].map(([mode, label]) => (
                  <Choice key={mode} type="radio" name="analysis.result_mode" value={mode} required
                    aria-invalid={Boolean(errors["analysis.result_mode"])}
                    aria-describedby={errors["analysis.result_mode"] ? modeErrorId : undefined}
                    checked={resultMode === mode} onChange={() => {
                      setResultMode(mode);
                      clearField("analysis.parallels");
                      clearField("analysis.reported_dry_matter_pct");
                    }}>{label}</Choice>
                ))}
              </div>
              {errors["analysis.result_mode"] && <small id={modeErrorId} className="technology-error">{errors["analysis.result_mode"]}</small>}
            </fieldset>
            {resultMode === "reported" && (
              <div className="technology-grid">
                <Field {...props("analysis.reported_dry_matter_pct", showOilResults
                  ? "Массовая доля сухих веществ с учётом масла, %" : "Массовая доля сухих веществ, %",
                { required: true, inputMode: "decimal", defaultValue: initial.analysis?.reported_dry_matter_pct ?? "" })} />
              </div>
            )}
            {resultMode === "weighings" && (
              <Weighings rows={parallels} errors={errors} showOilResults={showOilResults}
                onEdit={(id, field, value) => setParallels((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row))}
                onAdd={() => {
                  const id = nextParallel.current++;
                  setParallels((rows) => [...rows, { id }]);
                  clearField("analysis.parallels");
                }}
                onRemove={(id) => {
                  setParallels((rows) => rows.filter((row) => row.id !== id));
                  clearField("analysis.parallels");
                }} />
            )}
            {showOilResults && (
              <div className="technology-grid">
                <Field {...props(`analysis.${oilFreePercent}`, "Итоговая массовая доля без учёта масла по протоколу, %", {
                  hint: "Необязательно", inputMode: "decimal", defaultValue: initial.analysis?.[oilFreePercent] ?? "",
                })} />
              </div>
            )}
          </>
        )}
      </section>

      <div className="technology-actions">
        <button type="submit" className="technology-primary" disabled={saving}>
          {saving ? "Сохранение…" : record ? "Сохранить изменения" : "Сохранить результаты"}
        </button>
        {record && <button type="button" onClick={onCancel} disabled={saving}>Отмена</button>}
        <small><span className="technology-required" aria-hidden="true">*</span> Обязательные поля</small>
      </div>
      {removesSavedData && <p role="status">После сохранения данные отключённых разделов или полей будут удалены из записи.</p>}
      {failure && <p className="technology-error" role="alert">{failure}</p>}
    </form>
  );
}
