import React, { useEffect, useRef, useState } from "react";
import { getTechnologyOptions } from "../../api/technology";
import TechnologyEntry from "./TechnologyEntry";
import TechnologyJournal from "./TechnologyJournal";
import "./technology.css";

const emptyOptions = { groups: [], subgroups: [], processing_types: [] };

function mergeProcessingTypes(current, incoming) {
  return [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "ru") || a.id - b.id);
}

export default function TechnologyPage() {
  const [tab, setTab] = useState("entry");
  const [options, setOptions] = useState(emptyOptions);
  const [optionsState, setOptionsState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);
  const journalTab = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getTechnologyOptions(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setOptions((current) => ({
        ...data,
        processing_types: mergeProcessingTypes(current.processing_types, data.processing_types),
      }));
      setOptionsState("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setOptionsState("error");
    });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (saved) journalTab.current?.focus();
  }, [saved, revision]);

  const onProcessingTypeAdded = (item) => {
    setOptions((current) => ({
      ...current,
      processing_types: mergeProcessingTypes(current.processing_types, [item]),
    }));
  };

  return (
    <div className="technology-page">
      <div className="technology-panel technology-actions technology-tabs" role="group" aria-label="Технологический модуль">
        <button type="button" aria-pressed={tab === "entry"} onClick={() => { setTab("entry"); setSaved(false); }}>Ввод данных</button>
        <button ref={journalTab} type="button" aria-pressed={tab === "journal"} onClick={() => setTab("journal")}>Внесённые данные</button>
      </div>
      {tab === "entry" && optionsState === "loading" && <p role="status">Загрузка справочников…</p>}
      {tab === "entry" && optionsState === "error" && (
        <div className="technology-panel technology-actions" role="alert">
          <p className="technology-error">Не удалось загрузить справочники.</p>
          <button type="button" onClick={() => { setOptionsState("loading"); setAttempt((value) => value + 1); }}>Повторить</button>
        </div>
      )}
      <div hidden={tab !== "entry"}>
        <TechnologyEntry key={revision} options={options} onProcessingTypeAdded={onProcessingTypeAdded} onSaved={() => {
          setRevision((value) => value + 1);
          setSaved(true);
          setTab("journal");
        }} />
      </div>
      {tab === "journal" && (
        <>
          {saved && <p className="technology-saved" role="status">Результаты сохранены.</p>}
          <TechnologyJournal key={revision} options={options} onProcessingTypeAdded={onProcessingTypeAdded} />
        </>
      )}
    </div>
  );
}
