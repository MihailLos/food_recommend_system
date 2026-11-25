import React, { useEffect, useRef, useState } from "react";
import { getTechnologyRecord, listTechnologyRecords } from "../../api/technology";
import { formatCalculatedPercent, formatNumber, formatUnit } from "./technologyFormat";

function Facts({ items }) {
  return (
    <dl className="technology-facts">
      {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}
    </dl>
  );
}

function WeighingTable({ parallels }) {
  return (
    <div className="technology-table-wrap">
      <table className="technology-table" aria-label="Взвешивания по параллелям">
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">Тара m₀, г</th>
            <th scope="col">До сушки m₁, г</th>
            <th scope="col">После сушки m₂, г</th>
            <th scope="col">Сухой остаток, г</th>
            <th scope="col">Сухие вещества, %</th>
          </tr>
        </thead>
        <tbody>
          {parallels.map((parallel) => (
            <tr key={parallel.parallel_number}>
              <th scope="row">{parallel.parallel_number}</th>
              {["m0_g", "m1_g", "m2_g", "dry_residue_g"].map((key) =>
                <td key={key} className="technology-number">{formatNumber(parallel[key])}</td>,
              )}
              <td className="technology-number">{formatCalculatedPercent(parallel.dry_matter_pct)}</td>
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
      name: `После тепловой обработки · ${part.processing_name}`, analyses: part.analyses })),
  ];
  const measured = groups.filter(({ analyses }) => analyses.length);
  if (!measured.length) return <p>Лабораторный анализ ещё не внесён.</p>;
  return measured.map(({ key, name, analyses }) => (
    <section className="technology-subsection" key={key}>
      <h3>{name}</h3>
      {analyses.map((analysis, index) => (
        <div className="technology-stack" key={analysis.id}>
          {analyses.length > 1 && <h4>Анализ {index + 1}</h4>}
          <p>{analysis.result_mode === "reported" ? "Готовый процент лаборатории" : "Среднее по параллелям"} ·{" "}
            <strong>{formatAnalysisPercent(analysis, " %")}</strong>
          </p>
          {analysis.result_mode === "weighings" && (
            <>
              <p>Средний сухой остаток в навеске · {formatUnit(analysis.avg_dry_residue_g, "г")}</p>
              <details>
                <summary>Взвешивания по параллелям ({analysis.parallel_count})</summary>
                <WeighingTable parallels={analysis.parallels ?? []} />
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

function RecordRow({ record, onOpen }) {
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
    ...heating.map((part) => ({ key: `heat-${part.id}`, stage: "После тепловой обработки", analyses: part.analyses })),
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
        {stagesWithAnalyses.length ? stagesWithAnalyses.map(({ key, stage, analyses }) => (
          <div key={key}>
            {analyses.map((analysis) => formatAnalysisPercent(analysis)).join(" / ")}
            {labelAnalysisStage && <small>{stage}</small>}
          </div>
        )) : "—"}
      </td>
      <td><button type="button" data-record-id={record.id} onClick={() => onOpen(record.id)}
        aria-label={`Открыть запись: ${batch.product_name}, партия №${batch.id}, ${processing.join(", ") || "без обработки"}`}>Открыть</button></td>
    </tr>
  );
}

export default function TechnologyJournal() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState({});
  const [attempt, setAttempt] = useState(0);
  const focusId = useRef(null);
  const backButton = useRef(null);
  const table = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const pending = selected
      ? getTechnologyRecord(selected, controller.signal)
      : listTechnologyRecords(page, controller.signal);
    pending.then((data) => {
      if (!controller.signal.aborted) setResult({ selected, page, attempt, data });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ selected, page, attempt, error });
    });
    return () => controller.abort();
  }, [selected, page, attempt]);

  const current = result.selected === selected && result.page === page && result.attempt === attempt ? result : {};
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

  return (
    <section className="technology-panel">
      {selected ? (
        <div><button ref={backButton} type="button" onClick={() => { focusId.current = selected; setSelected(null); }}>К списку</button></div>
      ) : <h2>Журнал технолога</h2>}
      {error ? (
        <div className="technology-actions" role="alert">
          <p className="technology-error">{error.response?.status === 404 ? "Запись не найдена." : "Не удалось загрузить данные."}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>
        </div>
      ) : !data ? (
        <p role="status">Загрузка…</p>
      ) : selected ? (
        <RecordDetails key={selected} record={data} />
      ) : !data.results.length ? (
        <p>Технологических записей пока нет.</p>
      ) : (
        <>
          <div className="technology-table-wrap" ref={table}>
            <table className="technology-table" aria-label="Внесённые технологические данные">
              <thead>
                <tr>
                  <th scope="col">Продукт и партия</th>
                  <th scope="col">Обработка</th>
                  <th scope="col" className="technology-number">Масса, г</th>
                  <th scope="col" className="technology-number">Сухие вещества, %</th>
                  <th scope="col"><span className="technology-visually-hidden">Подробности</span></th>
                </tr>
              </thead>
              <tbody>{data.results.map((record) => <RecordRow key={record.id} record={record} onOpen={setSelected} />)}</tbody>
            </table>
          </div>
          {(data.previous || data.next) && (
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
