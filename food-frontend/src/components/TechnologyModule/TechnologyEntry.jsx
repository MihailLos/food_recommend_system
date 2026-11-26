import React, { useRef, useState } from "react";
import { createTechnologyRecord } from "../../api/technology";
import { BatchPicker, CatalogPicker, Choice, Field, ProcessingPicker, SelectOptions } from "./TechnologyFields";
import { formatCalculatedPercent, formatNumber } from "./technologyFormat";

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

function buildPayload(form, { batch, manual, preprocessing, heating, analyze, resultMode, parallels }) {
  const fields = new FormData(form);
  const field = (name) => String(fields.get(name) ?? "").trim();
  const decimal = (name) => field(name).replace(",", ".") || null;

  const record = { weight_g: decimal("weight_g") };
  if (batch) {
    record.batch_id = batch.id;
  } else {
    record.batch = {
      product_name: field("batch.product_name"),
      sort_name: field("batch.sort_name") || null,
      source_place: field("batch.source_place") || null,
      acquisition_date: field("batch.acquisition_date") || null,
      manual: manual?.id ?? null,
    };
  }
  if (preprocessing) {
    record.preprocessing = {
      cpt: Number(field("preprocessing.cpt")),
      weight_g: decimal("preprocessing.weight_g"),
      is_cut: fields.has("preprocessing.is_cut"),
    };
  }
  if (heating) {
    record.heating = {
      cpt: Number(field("heating.cpt")),
      weight_g: decimal("heating.weight_g"),
      processing_temperature_celsius: decimal("heating.processing_temperature_celsius"),
      added_water_g: decimal("heating.added_water_g"),
      added_oil_g: decimal("heating.added_oil_g"),
    };
  }
  if (analyze) {
    record.analysis = { stage: field("analysis.stage"), result_mode: resultMode };
    if (resultMode === "reported") {
      record.analysis.reported_dry_matter_pct = decimal("analysis.reported_dry_matter_pct");
    } else {
      record.analysis.parallels = parallels.map((_, index) => Object.fromEntries(
        masses.map(([key]) => [key, decimal(`analysis.parallels.${index}.${key}`)]),
      ));
    }
  }
  return record;
}

function calculateParallel(row) {
  const values = masses.map(([key]) => row[key]?.trim().replace(",", "."));
  if (!values.every((value) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value ?? ""))) return null;
  const [m0, m1, m2] = values.map(Number);
  if (![m0, m1, m2].every(Number.isFinite) || m0 < 0 || m1 <= m0 || m2 < m0 || m2 > m1) return null;
  return { residue: m2 - m0, percent: (m2 - m0) * 100 / (m1 - m0) };
}

function Weighings({ rows, onEdit, onAdd, onRemove, errors }) {
  const results = rows.map(calculateParallel);
  const average = (key) => results.reduce((total, row) => total + row[key], 0) / results.length;
  return (
    <div className="technology-stack">
      {rows.map((row, index) => {
        const path = `analysis.parallels.${index}`;
        return (
          <fieldset className="technology-subsection" key={row.id}>
            <legend>Параллель {index + 1}</legend>
            <div className="technology-grid technology-grid-three">
              {masses.map(([key, label]) => (
                <Field key={key} name={`${path}.${key}`} label={label} required inputMode="decimal"
                  value={row[key] ?? ""} onChange={(event) => onEdit(row.id, key, event.target.value)}
                  error={errors[`${path}.${key}`]} />
              ))}
            </div>
            <div className="technology-actions">
              {results[index] && <span>Сухой остаток {formatNumber(results[index].residue)} г · {formatCalculatedPercent(results[index].percent, " %")}</span>}
              {rows.length > 1 && <button type="button" onClick={() => onRemove(row.id)}
                aria-label={`Убрать параллель ${index + 1}`}>Убрать</button>}
            </div>
          </fieldset>
        );
      })}
      <div>
        <button type="button" name="analysis.parallels" onClick={onAdd}>+ Добавить параллель</button>
        {errors["analysis.parallels"] && <p className="technology-error">{errors["analysis.parallels"]}</p>}
      </div>
      {results.every(Boolean) && (
        <p>Средний сухой остаток {formatNumber(average("residue"))} г · Сухие вещества {formatCalculatedPercent(average("percent"), " %")}</p>
      )}
    </div>
  );
}

export default function TechnologyEntry({ options, onProcessingTypeAdded, onSaved }) {
  const [batchMode, setBatchMode] = useState("new");
  const [batch, setBatch] = useState(null);
  const [manual, setManual] = useState(null);
  const [preprocessing, setPreprocessing] = useState(false);
  const [heating, setHeating] = useState(false);
  const [analyze, setAnalyze] = useState(false);
  const [stage, setStage] = useState("");
  const [resultMode, setResultMode] = useState("");
  const [parallels, setParallels] = useState([{ id: 0 }]);
  const nextParallel = useRef(1);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
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
      const record = buildPayload(form, { batch: batchMode === "existing" ? batch : null, manual, preprocessing,
        heating, analyze, resultMode, parallels });
      await createTechnologyRecord(record);
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
      } else {
        setFailure("Не удалось подтвердить сохранение. Перед повторной отправкой проверьте журнал.");
      }
    } finally {
      setSaving(false);
    }
  };

  const props = (name, label, extra) => ({ name, label, ...extra, error: errors[name] });
  const processingPicker = (name, label) => (
    <ProcessingPicker name={name} label={label} error={errors[name]} items={options.processing_types}
      onAdded={(item) => { onProcessingTypeAdded(item); clearField(name); }} />
  );

  return (
    <form className="technology-stack" noValidate onSubmit={submit} onChange={(event) => clearField(event.target.name)}>
      <section className="technology-panel">
        <h2>Основные данные о продукте</h2>
        <div className="technology-actions" role="group" aria-label="Выбор партии">
          <Choice type="radio" name="batchMode" checked={batchMode === "new"}
            onChange={() => { setBatchMode("new"); clearField("batch_id"); }}>Новая партия</Choice>
          <Choice type="radio" name="batchMode" checked={batchMode === "existing"}
            onChange={() => { setBatchMode("existing"); clearField("batch"); }}>Существующая партия</Choice>
        </div>
        {batchMode === "new" ? (
          <>
            <div className="technology-grid technology-new-batch">
              <Field {...props("batch.product_name", "Название продукта", { required: true, maxLength: 120 })} />
              <Field {...props("batch.sort_name", "Сорт (разновидность продукта)", { hint: "Необязательно" })} />
              <Field {...props("batch.source_place", "Происхождение (страна и/или город происхождения)", { hint: "Необязательно" })} />
              <Field {...props("batch.acquisition_date", "Дата приобретения", { hint: "Необязательно", type: "date" })} />
            </div>
            <CatalogPicker groups={options.groups} subgroups={options.subgroups} value={manual} onChange={setManual}
              error={errors["batch.manual"]} />
          </>
        ) : <BatchPicker value={batch} onChange={setBatch} error={errors.batch_id} />}
        <div className="technology-grid">
          <Field {...props("weight_g", "Масса до обработки, г", { required: true, inputMode: "decimal" })} />
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
            {processingPicker("preprocessing.cpt", "Вид первичной обработки")}
            <Field {...props("preprocessing.weight_g", "Масса после первичной обработки, г", { required: true, inputMode: "decimal" })} />
            <Choice type="checkbox" name="preprocessing.is_cut">Продукт нарезали</Choice>
          </div>
        )}
        <Choice type="checkbox" checked={heating} onChange={(event) => {
          setHeating(event.target.checked);
          if (!event.target.checked && stage === "processed") setStage("");
          clearField("heating");
        }}>Добавить тепловую обработку</Choice>
        {heating && (
          <div className="technology-grid">
            {processingPicker("heating.cpt", "Способ обработки")}
            <Field {...props("heating.weight_g", "Масса после нагрева, г", { required: true, inputMode: "decimal" })} />
            <Field {...props("heating.processing_temperature_celsius", "Температура среды при закладке, °C", { hint: "Если известно", inputMode: "decimal" })} />
            <Field {...props("heating.added_water_g", "Добавлено воды, г", { hint: "Если известно", inputMode: "decimal" })} />
            <Field {...props("heating.added_oil_g", "Добавлено масла, г", { hint: "Если известно", inputMode: "decimal" })} />
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
                    aria-describedby={errors["analysis.result_mode"] ? "technology-mode-error" : undefined}
                    checked={resultMode === mode} onChange={() => {
                      setResultMode(mode);
                      clearField("analysis.parallels");
                      clearField("analysis.reported_dry_matter_pct");
                    }}>{label}</Choice>
                ))}
              </div>
              {errors["analysis.result_mode"] && <small id="technology-mode-error" className="technology-error">{errors["analysis.result_mode"]}</small>}
            </fieldset>
            {resultMode === "reported" && (
              <div className="technology-grid">
                <Field {...props("analysis.reported_dry_matter_pct", "Массовая доля сухих веществ, %", { required: true, inputMode: "decimal" })} />
              </div>
            )}
            {resultMode === "weighings" && (
              <Weighings rows={parallels} errors={errors}
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
          </>
        )}
      </section>

      <div className="technology-actions">
        <button type="submit" className="technology-primary" disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить результаты"}
        </button>
        <small><span className="technology-required" aria-hidden="true">*</span> Обязательные поля</small>
      </div>
      {failure && <p className="technology-error" role="alert">{failure}</p>}
    </form>
  );
}
