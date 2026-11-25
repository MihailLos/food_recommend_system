import React, { useEffect, useState } from "react";
import { getTechnologyMatches } from "../../api/technology";

export function Field({ label, hint, required, error, name, options, ...props }) {
  const id = `technology-${name}`;
  const attributes = {
    id, name, required, ...props,
    "aria-invalid": Boolean(error),
    "aria-describedby": [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined,
  };
  return (
    <div className="technology-field">
      <label htmlFor={id}>
        {label}{required && <span className="technology-required" aria-hidden="true"> *</span>}
      </label>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {options ? <select {...attributes}>{options}</select> : <input {...attributes} />}
      {error && <small className="technology-error" id={`${id}-error`}>{error}</small>}
    </div>
  );
}

export function Choice({ children, ...props }) {
  return <label className="technology-choice"><input {...props} /> {children}</label>;
}

export function SelectOptions({ items, placeholder }) {
  return (
    <>
      <option value="">{placeholder}</option>
      {items.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </>
  );
}

function useMatches(path) {
  const [result, setResult] = useState({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    const delay = setTimeout(async () => {
      try {
        const items = await getTechnologyMatches(path, controller.signal);
        if (!controller.signal.aborted) setResult({ path, attempt, items });
      } catch {
        if (!controller.signal.aborted) setResult({ path, attempt, failed: true });
      }
    }, 250);
    return () => {
      clearTimeout(delay);
      controller.abort();
    };
  }, [path, attempt]);
  const current = result.path === path && result.attempt === attempt ? result : {};
  return {
    items: current.items ?? [],
    loading: Boolean(path) && !current.items && !current.failed,
    failed: current.failed,
    retry: () => setAttempt((value) => value + 1),
  };
}

function MatchStatus({ matches }) {
  if (matches.loading) return <small role="status">Загрузка…</small>;
  if (!matches.failed) return null;
  return (
    <div className="technology-actions" role="alert">
      <small className="technology-error">Не удалось загрузить список.</small>
      <button type="button" onClick={matches.retry}>Повторить</button>
    </div>
  );
}

export function batchName(batch) {
  return [`№${batch.id}`, batch.product_name, batch.sort_name, batch.source_place, batch.acquisition_date]
    .filter(Boolean).join(" · ");
}

export function BatchPicker({ value, onChange, error }) {
  const [search, setSearch] = useState("");
  const matches = useMatches(`batches/?search=${encodeURIComponent(search.trim())}`);
  const items = matches.items.map((batch) => ({ id: batch.id, name: batchName(batch) }));
  if (value && !items.some(({ id }) => String(id) === String(value.id))) {
    items.unshift({ id: value.id, name: batchName(value) });
  }
  const placeholder = !matches.loading && !matches.failed && !items.length ? "Партии не найдены" : "Выберите партию";
  return (
    <>
      <div className="technology-grid">
        <Field name="batchSearch" label="Название продукта или номер партии" type="search"
          value={search} onChange={(event) => setSearch(event.target.value)} />
        <Field name="batch_id" label="Партия" required error={error} value={value?.id ?? ""}
          onChange={(event) => onChange(matches.items.find(({ id }) => String(id) === event.target.value) ?? null)}
          options={<SelectOptions items={items} placeholder={placeholder} />} />
      </div>
      <MatchStatus matches={matches} />
    </>
  );
}

export function CatalogPicker({ groups, subgroups, value, onChange, error }) {
  const [mode, setMode] = useState("browse");
  const [group, setGroup] = useState("");
  const [subgroup, setSubgroup] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim();
  const path = mode === "browse"
    ? subgroup && `catalog-products/?subgroup=${subgroup}`
    : query.length >= 2 && `catalog-products/?search=${encodeURIComponent(query)}`;
  const matches = useMatches(path);
  const items = [...matches.items];
  if (value && !items.some(({ id }) => id === value.id)) items.unshift(value);

  let placeholder = "Выберите продукт";
  if (!path) placeholder = mode === "browse" ? "Выберите подгруппу" : "Введите хотя бы 2 буквы";
  else if (!matches.loading && !matches.failed && !items.length) placeholder = "Продукты не найдены";

  return (
    <fieldset className="technology-subsection">
      <legend>Соответствие в справочнике</legend>
      <small>Необязательно</small>
      <div className="technology-actions">
        <Choice type="radio" name="catalogMode" checked={mode === "browse"} onChange={() => setMode("browse")}>
          По группе и подгруппе
        </Choice>
        <Choice type="radio" name="catalogMode" checked={mode === "search"} onChange={() => setMode("search")}>
          Поиск по названию
        </Choice>
      </div>
      <div className={`technology-grid ${mode === "browse" ? "technology-grid-three" : ""}`}>
        {mode === "browse" ? (
          <>
            <Field name="catalogGroup" label="Группа" value={group} onChange={(event) => {
              setGroup(event.target.value);
              setSubgroup("");
              onChange(null);
            }} options={<SelectOptions items={groups} placeholder="Выберите группу" />} />
            <Field name="catalogSubgroup" label="Подгруппа" value={subgroup} disabled={!group}
              onChange={(event) => { setSubgroup(event.target.value); onChange(null); }}
              options={<SelectOptions items={subgroups.filter((item) => String(item.product_type_id) === group)}
                placeholder="Выберите подгруппу" />} />
          </>
        ) : (
          <Field name="catalogSearch" label="Название в справочнике" type="search" value={search}
            onChange={(event) => setSearch(event.target.value)} />
        )}
        <Field name="batch.manual" label="Продукт в справочнике" value={value?.id ?? ""} error={error}
          disabled={!items.length && !error}
          onChange={(event) => onChange(items.find(({ id }) => String(id) === event.target.value) ?? null)}
          options={<SelectOptions items={items} placeholder={placeholder} />} />
      </div>
      <MatchStatus matches={matches} />
    </fieldset>
  );
}
