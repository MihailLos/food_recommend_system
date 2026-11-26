import React, { useEffect, useRef, useState } from "react";
import { getTechnologyRecord, getTechnologyRecordFilters, listTechnologyRecords } from "../../api/technology";
import TechnologyEntry from "./TechnologyEntry";
import { batchName, SelectOptions } from "./TechnologyFields";
import { formatCalculatedPercent, formatNumber, formatUnit } from "./technologyFormat";

function Facts({ items }) {
  return (
    <dl className="technology-facts">
      {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}
    </dl>
  );
}

function WeighingTable({ parallels, title = "Взвешивания по параллелям", withoutOil = false }) {
  const suffix = withoutOil ? "_without_oil" : "";
  return (
    <div className="technology-table-wrap">
      <table className="technology-table" aria-label={title}>
        {withoutOil && <caption>{title}</caption>}
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">Тара m₀, г</th>
            <th scope="col">До сушки m₁, г</th>
            <th scope="col">После сушки m₂, г</th>
            <th scope="col">Сухой остаток, г</th>
            <th scope="col">Сухие вещества, %</th>
            {withoutOil && <th scope="col">Источник результата</th>}
          </tr>
        </thead>
        <tbody>
          {parallels.map((parallel) => (
            <tr key={parallel.parallel_number}>
              <th scope="row">{parallel.parallel_number}</th>
              {["m0", "m1", "m2", "dry_residue"].map((key) =>
                <td key={key} className="technology-number">{formatNumber(parallel[`${key}${suffix}_g`])}</td>,
              )}
              <td className="technology-number">
                {withoutOil && parallel.m0_without_oil_g == null ? formatNumber(parallel.dry_matter_without_oil_pct)
                  : formatCalculatedPercent(parallel[`dry_matter${suffix}_pct`])}
              </td>
              {withoutOil && <td>{parallel.m0_without_oil_g != null ? "По взвешиваниям"
                : parallel.dry_residue_without_oil_g != null || parallel.dry_matter_without_oil_pct != null
                  ? "Введено вручную" : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalysisResults({ record }) {
  const groups = [
    { key: "raw", name: "Без обработки", analyses: record.analyses },
    ...record.preprocessing.map((part) => ({ key: `prep-${part.id}`,
      name: `После первичной обработки · ${part.processing_name}`, analyses: part.analyses })),
    ...allHeating(record).map((part) => ({ key: `heat-${part.id}`,
      name: `После тепловой обработки · ${part.processing_name}`, analyses: part.analyses, usesOil: part.uses_oil })),
  ];
  const measured = groups.filter(({ analyses }) => analyses.length);
  if (!measured.length) return <p>Лабораторный анализ ещё не внесён.</p>;
  return measured.map(({ key, name, analyses, usesOil }) => (
    <section className="technology-subsection" key={key}>
      <h3>{name}</h3>
      {analyses.map((analysis, index) => (
        <div className="technology-stack" key={analysis.id}>
          {analyses.length > 1 && <h4>Анализ {index + 1}</h4>}
          <p>{usesOil && "С учётом масла · "}{analysis.result_mode === "reported" ? "Готовый процент лаборатории" : "Среднее по параллелям"} ·{" "}
            <strong>{formatAnalysisPercent(analysis, " %")}</strong>
          </p>
          {usesOil && analysis.reported_dry_matter_without_oil_pct != null && (
            <p>Без учёта масла · Итог по протоколу · <strong>{formatUnit(analysis.reported_dry_matter_without_oil_pct, "%")}</strong></p>
          )}
          {analysis.result_mode === "weighings" && (
            <>
              <p>{usesOil && "С учётом масла · "}Средний сухой остаток в навеске · {formatUnit(analysis.avg_dry_residue_g, "г")}</p>
              {usesOil && analysis.oil_free_pct_count > 0 && (
                <p>Без учёта масла · Средняя массовая доля · {formatCalculatedPercent(analysis.avg_dry_matter_without_oil_pct, " %")}
                  {" · "}{analysis.oil_free_pct_count} из {analysis.parallel_count} параллелей</p>
              )}
              {usesOil && analysis.oil_free_residue_count > 0 && (
                <p>Без учёта масла · Средний сухой остаток · {formatUnit(analysis.avg_dry_residue_without_oil_g, "г")}
                  {" · "}{analysis.oil_free_residue_count} из {analysis.parallel_count} параллелей</p>
              )}
              <details>
                <summary>Взвешивания по параллелям ({analysis.parallel_count})</summary>
                {usesOil && <h4>С учётом масла</h4>}
                <WeighingTable parallels={analysis.parallels ?? []} title={usesOil ? "С учётом масла" : undefined} />
                {usesOil && <WeighingTable parallels={analysis.parallels ?? []} title="Без учёта масла" withoutOil />}
              </details>
            </>
          )}
        </div>
      ))}
    </section>
  ));
}

function HeatingResults({ part }) {
  return (
    <Facts items={[
      ["Тепловая обработка", part.processing_name], ["После нагрева", formatUnit(part.weight_g, "г")],
      ["Температура среды при закладке", formatUnit(part.processing_temperature_celsius, "°C")],
      ["Добавлено воды", formatUnit(part.added_water_g, "г")], ["Добавлено масла", formatUnit(part.added_oil_g, "г")],
      ...(part.uses_oil && part.added_oil_g == null ? [["Масло использовали", "Да"]] : []),
    ]} />
  );
}

function ProcessingResults({ record }) {
  return (
    <>
      <Facts items={[["Масса до обработки", formatUnit(record.weight_g, "г")]]} />
      {record.preprocessing.map((part) => (
        <section className="technology-subsection" key={part.id}>
          <Facts items={[
            ["Первичная обработка", part.processing_name],
            ["После первичной обработки", formatUnit(part.weight_g, "г")],
            ["Продукт нарезали", part.is_cut ? "Да" : "Нет"],
          ]} />
          {part.heating.map((heat) => <HeatingResults key={heat.id} part={heat} />)}
        </section>
      ))}
      {record.heating.map((part) => <HeatingResults key={part.id} part={part} />)}
    </>
  );
}

function RecordDetails({ record }) {
  const [tab, setTab] = useState("processing");
  const { batch } = record;
  return (
    <>
      <div>
        <h2>{batch.product_name}</h2>
        <p className="technology-muted">{[`Партия №${batch.id}`, batch.sort_name, batch.source_place].filter(Boolean).join(" · ")}</p>
      </div>
      {(batch.acquisition_date || batch.manual_name) && (
        <Facts items={[
          ...(batch.acquisition_date ? [["Дата приобретения", batch.acquisition_date.split("-").reverse().join(".")]] : []),
          ...(batch.manual_name ? [["Продукт в справочнике", batch.manual_name]] : []),
        ]} />
      )}
      <div className="technology-actions technology-tabs" role="group" aria-label="Подробности записи">
        <button type="button" aria-pressed={tab === "processing"} onClick={() => setTab("processing")}>Обработка</button>
        <button type="button" aria-pressed={tab === "lab"} onClick={() => setTab("lab")}>Лабораторные данные</button>
      </div>
      {tab === "processing" ? <ProcessingResults record={record} /> : <AnalysisResults record={record} />}
    </>
  );
}

function allHeating(record) {
  return [...record.heating, ...record.preprocessing.flatMap((part) => part.heating)];
}

function formatAnalysisPercent({ final_dry_matter_pct: value, result_mode: mode }, suffix = "") {
  if (mode === "weighings") return formatCalculatedPercent(value, suffix);
  return value == null ? "—" : formatNumber(value) + suffix;
}

function RecordRow({ record, onOpen, onEdit }) {
  const { batch, preprocessing } = record;
  const heating = allHeating(record);
  const latestStages = [
    ...heating.map((part) => ({ ...part, key: `heat-${part.id}`, stage: "После нагрева" })),
    ...preprocessing.filter((part) => !part.heating.length)
      .map((part) => ({ ...part, key: `prep-${part.id}`, stage: "После первичной обработки" })),
  ];
  if (!latestStages.length) latestStages.push({ key: "raw", weight_g: record.weight_g, stage: "До обработки" });

  const processing = [...new Set((heating.length ? heating : preprocessing).map((part) => part.processing_name))];
  const stagesWithAnalyses = [
    { key: "raw", stage: "Без обработки", analyses: record.analyses },
    ...preprocessing.map((part) => ({ key: `prep-${part.id}`, stage: "После первичной обработки", analyses: part.analyses })),
    ...heating.map((part) => ({
      key: `heat-${part.id}`, stage: "После тепловой обработки", analyses: part.analyses, usesOil: part.uses_oil,
    })),
  ].filter(({ analyses }) => analyses.length);
  const labelAnalysisStage = stagesWithAnalyses.length > 1 || stagesWithAnalyses.some(({ key }) =>
    !latestStages.some((latest) => latest.key === key),
  );
  return (
    <tr>
      <th scope="row">
        <strong>{batch.product_name}</strong>
        <small>{[`Партия №${batch.id}`, batch.sort_name, batch.source_place].filter(Boolean).join(" · ")}</small>
      </th>
      <td>{processing.length ? processing.join(", ") : "Без обработки"}</td>
      <td className="technology-number">{latestStages.map((part) => (
        <div key={part.key}>{formatNumber(part.weight_g)}<small>{part.stage}</small></div>
      ))}</td>
      <td className="technology-number">
        {stagesWithAnalyses.length ? stagesWithAnalyses.map(({ key, stage, analyses, usesOil }) => (
          <div key={key}>
            {analyses.map((analysis) => (
              <div key={analysis.id}>
                {(usesOil || analysis.final_dry_matter_without_oil_pct != null) ? (
                  <>
                    <div>{formatAnalysisPercent(analysis)} <small className="technology-inline-label">с учётом масла</small></div>
                    {analysis.final_dry_matter_without_oil_pct != null && <div>{analysis.reported_dry_matter_without_oil_pct != null
                      ? formatNumber(analysis.reported_dry_matter_without_oil_pct)
                      : formatCalculatedPercent(analysis.final_dry_matter_without_oil_pct)}
                      {" "}<small className="technology-inline-label">без учёта масла</small></div>}
                  </>
                ) : formatAnalysisPercent(analysis)}
              </div>
            ))}
            {labelAnalysisStage && <small>{stage}</small>}
          </div>
        )) : "—"}
      </td>
      <td><div className="technology-actions">
        <button type="button" data-record-id={record.id} onClick={() => onOpen(record.id)}
          aria-label={`Открыть запись: ${batch.product_name}, партия №${batch.id}, ${processing.join(", ") || "без обработки"}`}>Открыть</button>
        <button type="button" data-edit-id={record.id} onClick={() => onEdit(record.id)}
          aria-label={`Редактировать запись: ${batch.product_name}, партия №${batch.id}, ${processing.join(", ") || "без обработки"}`}
          title="Редактировать"><span aria-hidden="true">✏️</span></button>
      </div></td>
    </tr>
  );
}

function SortHeader({ label, field, ordering, onSort, numeric, children }) {
  const active = ordering?.replace(/^-/, "") === field;
  const direction = !active ? "none" : ordering.startsWith("-") ? "descending" : "ascending";
  return (
    <th scope="col" aria-sort={direction} className={numeric ? "technology-number" : undefined}>
      <button className="technology-sort" type="button" onClick={() => onSort(field)}>
        {label} <span aria-hidden="true">{direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}</span>
      </button>
      {children}
    </th>
  );
}

export default function TechnologyJournal({ options, onProcessingTypeAdded }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState({});
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState({});
  const [filterOptions, setFilterOptions] = useState(null);
  const [filterError, setFilterError] = useState(false);
  const [filterAttempt, setFilterAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const focusId = useRef(null);
  const backButton = useRef(null);
  const table = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getTechnologyRecordFilters(controller.signal).then((data) => {
      if (!controller.signal.aborted) {
        setFilterOptions(data);
        setFilterError(false);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setFilterError(true);
    });
    return () => controller.abort();
  }, [filterAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const pending = selected
      ? getTechnologyRecord(selected, controller.signal)
      : listTechnologyRecords(page, controller.signal, query);
    pending.then((data) => {
      if (!controller.signal.aborted) setResult({ selected, page, query, attempt, data });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ selected, page, query, attempt, error });
    });
    return () => controller.abort();
  }, [selected, page, query, attempt]);

  const current = result.selected === selected && result.page === page
    && result.query === query && result.attempt === attempt ? result : {};
  const { data, error } = current;

  useEffect(() => {
    if (selected) backButton.current?.focus();
  }, [selected]);

  useEffect(() => {
    if (!selected && data && focusId.current) {
      table.current?.querySelector(`button[data-record-id="${focusId.current}"]`)?.focus();
      focusId.current = null;
    }
  }, [selected, data]);

  function open(id, edit) {
    setSaved(false);
    setEditing(edit);
    setSelected(id);
  }

  function back() {
    focusId.current = selected;
    setEditing(false);
    setSelected(null);
  }

  function changeQuery(key, value) {
    setPage(1);
    setQuery((current) => ({ ...current, [key]: value || undefined }));
  }

  const onSort = (field) => changeQuery("ordering", query.ordering === field ? `-${field}` : field);
  const sortProps = { ordering: query.ordering, onSort };
  const batches = filterOptions?.batches.map((batch) => ({ id: batch.id, name: batchName(batch) })) ?? [];

  return (
    <section className="technology-panel">
      {selected ? (
        <div><button ref={backButton} type="button" onClick={back}>К списку</button></div>
      ) : <h2>Журнал технолога</h2>}
      {saved && <p role="status" className="technology-saved">Изменения сохранены.</p>}
      {error && (
        <div className="technology-actions" role="alert">
          <p className="technology-error">{error.response?.status === 404 ? "Запись не найдена." : "Не удалось загрузить данные."}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>
        </div>
      )}
      {selected ? (
        !data ? !error && <p role="status">Загрузка…</p> : editing ? (
          data.editable ? (
            <>
              <h2>Редактирование записи</h2>
              <TechnologyEntry key={selected} record={data} options={options} onProcessingTypeAdded={onProcessingTypeAdded}
                onCancel={back} onSaved={() => {
                  back();
                  setPage(1);
                  setAttempt((value) => value + 1);
                  setFilterAttempt((value) => value + 1);
                  setSaved(true);
                }} />
            </>
          ) : <p>Эта запись содержит несколько обработок или анализов. Их можно посмотреть в подробностях записи.</p>
        ) : <RecordDetails key={selected} record={data} />
      ) : (
        <>
          {filterError && (
            <div className="technology-actions" role="alert">
              <p className="technology-error">Не удалось загрузить варианты фильтров.</p>
              <button type="button" onClick={() => setFilterAttempt((value) => value + 1)}>Повторить</button>
            </div>
          )}
          <div className="technology-table-wrap" ref={table}>
            <table className="technology-table" aria-label="Внесённые технологические данные">
              <thead>
                <tr>
                  <SortHeader {...sortProps} label="Продукт и партия" field="batch">
                    <select className="technology-filter" aria-label="Фильтр по партии" value={query.batch ?? ""}
                      disabled={!filterOptions} onChange={(event) => changeQuery("batch", event.target.value)}>
                      <SelectOptions items={batches} placeholder="Все партии" />
                    </select>
                  </SortHeader>
                  <SortHeader {...sortProps} label="Обработка" field="processing">
                    <select className="technology-filter" aria-label="Фильтр по обработке" value={query.processing ?? ""}
                      disabled={!filterOptions} onChange={(event) => changeQuery("processing", event.target.value)}>
                      <SelectOptions items={filterOptions?.processing ?? []} placeholder="Все способы" />
                    </select>
                  </SortHeader>
                  <SortHeader {...sortProps} label="Масса, г" field="weight" numeric />
                  <SortHeader {...sortProps} label="Сухие вещества, %" field="dry_matter" numeric />
                  <th scope="col"><span className="technology-visually-hidden">Действия</span></th>
                </tr>
              </thead>
              <tbody>
                {data?.results.map((record) => (
                  <RecordRow key={record.id} record={record} onOpen={(id) => open(id, false)} onEdit={(id) => open(id, true)} />
                ))}
                {!data && !error && <tr><td colSpan={5}><p role="status">Загрузка…</p></td></tr>}
                {data?.results.length === 0 && <tr><td colSpan={5}>
                  {query.batch || query.processing ? "По выбранным фильтрам ничего не найдено." : "Технологических записей пока нет."}
                </td></tr>}
              </tbody>
            </table>
          </div>
          {(data?.previous || data?.next) && (
            <div className="technology-actions">
              <button type="button" disabled={!data.previous} onClick={() => setPage(page - 1)}>Назад</button>
              <span>Страница {page}</span>
              <button type="button" disabled={!data.next} onClick={() => setPage(page + 1)}>Далее</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
