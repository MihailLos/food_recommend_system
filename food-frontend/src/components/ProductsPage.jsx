import React, { useEffect, useMemo, useState } from "react";
import useDebounce from "../hooks/useDebounce";
import useCatalog from "../hooks/useCatalog";
import SearchBar from "../components/SearchBar";
import GroupSection from "../components/GroupSection";
import ColumnPicker from "../components/ColumnPicker";
import FiltersPanel from "../components/FiltersPanel";
import SortControl from "../components/SortControl";
import AddProductModal from "../components/AddProductModal";
import NutritionCalculatorModal from "../components/NutritionCalculatorModal";
import { ALL_COLUMNS } from "../config/column";
import { exportJsonToExcel } from "../utils/exportExcel";

/** утилиты */
function applyFilters(items, filters) {
  let out = items;

  // тип
  if (filters.typeId) {
    out = out.filter(r => String(r.typeId) === String(filters.typeId));
  }

  // по имени
  if (filters.name && filters.name.trim()) {
    const s = filters.name.trim().toLowerCase();
    out = out.filter(r => (r.name || "").toLowerCase().includes(s));
  }

  // по числовым диапазонам
  for (const [key, range] of Object.entries(filters)) {
    if (!range || typeof range !== "object" || (!("min" in range) && !("max" in range))) continue;
    const { min = null, max = null } = range;
    out = out.filter(r => {
      const v = r[key];
      if (v == null || isNaN(v)) return false; // если задан фильтр, null/NaN не проходят
      if (min != null && Number(v) < min) return false;
      if (max != null && Number(v) > max) return false;
      return true;
    });
  }
  return out;
}

function applySort(items, sort) {
  const { key, dir } = sort;
  const sgn = dir === "asc" ? 1 : -1;
  const arr = [...items];
  arr.sort((a, b) => {
    const va = a[key], vb = b[key];
    if (key === "name") return sgn * String(va || "").localeCompare(String(vb || ""), "ru");
    const na = Number(va), nb = Number(vb);
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1; // пустые вниз
    if (isNaN(nb)) return -1;
    return sgn * (na - nb);
  });
  return arr;
}


export default function ProductsPage() {
  // поиск по серверу как раньше
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const { loading, error, items, allItems, saveProduct, addProductLocally, clearAll, reloadOriginal } = useCatalog(debounced);
  const [calcOpen, setCalcOpen] = useState(false);
  const [subtypeFilters, setSubtypeFilters] = useState({});

  // для модалки
  const [addOpen, setAddOpen] = useState(false);

  // уникальные типы для селекта
  const types = useMemo(() => {
    const map = new Map();
    for (const r of items) if (r.typeId) map.set(r.typeId, r.typeName || `Тип #${r.typeId}`);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a,b)=>String(a.name).localeCompare(String(b.name), "ru"));
  }, [items]);

  const allTypes = useMemo(() => {
    const map = new Map();
    for (const r of allItems) if (r.typeId) map.set(r.typeId, r.typeName || `Тип #${r.typeId}`);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a,b)=>String(a.name).localeCompare(String(b.name), "ru"));
  }, [allItems]);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("sidebarOpen");
    return saved === null ? true : saved === "true";
  });
  useEffect(() => {
    localStorage.setItem("sidebarOpen", String(sidebarOpen));
  }, [sidebarOpen]);

  // видимые столбцы: по умолчанию — продукт + ключевые нутриенты
  const [visibleKeys, setVisibleKeys] = useState(new Set([
    "name","protein_g","fats_g","carbs_g","energy_kcal","fiber_g","alcohol_pct"
  ]));
  const visibleColumns = useMemo(
    () => ALL_COLUMNS.filter(c => visibleKeys.has(c.key)),
    [visibleKeys]
  );
  const toggleColumn = (key) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (!next.has("name")) next.add("name"); // «name» обязателен
      return next;
    });
  };
  const selectAllColumns = () => {
    setVisibleKeys(new Set(ALL_COLUMNS.map(c => c.key)));
  };
  const getTypeKey = (group) => group.typeId ?? group.typeName;

  const toggleSubtypeForType = (typeKey, subtypeId) => {
    setSubtypeFilters(prev => {
      const current = new Set(prev[typeKey] || []);
      if (current.has(subtypeId)) {
        current.delete(subtypeId);
      } else {
        current.add(subtypeId);
      }
      const next = { ...prev };
      next[typeKey] = Array.from(current);
      // если все сняли – можно удалить запись, чтобы «нет фильтра» = «все подтипы»
      if (next[typeKey].length === 0) delete next[typeKey];
      return next;
    });
  };

  const clearSubtypesForType = (typeKey) => {
    setSubtypeFilters(prev => {
      const next = { ...prev };
      delete next[typeKey];
      return next;
    });
  };


  // фильтры: { typeId, name, protein_g:{min,max}, ... }
  const [filters, setFilters] = useState({});

  // сортировка
  const [sort, setSort] = useState({ key: "name", dir: "asc" });

  // применяем фильтры и сортировку ДО группировки
  const filteredSorted = useMemo(() => {
    const f = applyFilters(items, filters);
    return applySort(f, sort);
  }, [items, filters, sort]);

  // группировка по типам
  const groups = useMemo(() => {
  const byType = new Map();

  for (const r of filteredSorted) {
    const typeKey = r.typeId ?? `type:${r.typeName ?? "?"}`;
    const typeName = r.typeName || `Тип #${r.typeId ?? "?"}`;

    if (!byType.has(typeKey)) {
      byType.set(typeKey, {
        typeId: r.typeId ?? null,
        typeName,
        subMap: new Map(),
      });
    }

    const typeGroup = byType.get(typeKey);

    const subtypeKey = r.subtypeId ?? `sub:${r.subtypeName ?? "?"}`;
    const subtypeName = r.subtypeName || `Подтип #${r.subtypeId ?? "?"}`;

    if (!typeGroup.subMap.has(subtypeKey)) {
      typeGroup.subMap.set(subtypeKey, {
        subtypeKey,
        subtypeId: r.subtypeId ?? null,
        subtypeName,
        items: [],
      });
    }

    typeGroup.subMap.get(subtypeKey).items.push(r);
  }

  return Array.from(byType.values()).map(g => ({
      typeId: g.typeId,
      typeName: g.typeName,
      subgroups: Array.from(g.subMap.values()),
    }));
  }, [filteredSorted]);

  const handleExportCatalog = () => {
    // Берём только видимые столбцы
    const visibleKeys = new Set(visibleColumns.map(c => c.key));

    const rows = filteredSorted.map(item => {
      const row = {
        "Тип": item.typeName || "",
        "Подтип": item.subtypeName || "",
        "Продукт": item.name || "",
        "Продукт общепита": item.isComplex ? "Да" : "Нет",
      };

      // добавляем нутриенты по видимым столбцам
      ALL_COLUMNS.forEach(col => {
        if (!visibleKeys.has(col.key)) return;
        if (col.key === "name") return; // уже добавили как "Продукт"

        const v = item[col.key];
        row[col.label] = v == null ? "" : v; // лучше отдавать как число, Excel сам поймёт
      });

      return row;
    });

    exportJsonToExcel(rows, "catalog_current_view.xlsx");
  };

  return (
    <div
      style={{
        background: "#f6f7f9",
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: sidebarOpen ? "300px 1fr" : "0 1fr",   // ← ширина сайдбара
        transition: "grid-template-columns 200ms ease",
      }}
    >
      {/* Сайдбар */}
      <aside
        style={{
          borderRight: sidebarOpen ? "1px solid #eee" : "none",
          background: "#fff",
          overflow: "hidden",
          transition: "border-color 200ms ease",
        }}
        aria-hidden={!sidebarOpen}
      >
        {/* Чтобы красиво прятать содержимое, оборачиваем в контейнер с opacity */}
        <div style={{
          opacity: sidebarOpen ? 1 : 0,
          transition: "opacity 150ms ease",
          pointerEvents: sidebarOpen ? "auto" : "none",
        }}>
          <ColumnPicker
            visibleKeys={visibleKeys}
            onToggle={toggleColumn}
            onSelectAll={selectAllColumns}
            onClearAll={() => setVisibleKeys(new Set(["name"]))}
          />
          <FiltersPanel
            filters={filters}
            onChange={setFilters}
            types={types}
          />
        </div>
      </aside>

      {/* Контент */}
      <main>
        <header className="page-header">
          {/* Ряд 1: заголовок + действия */}
          <h1 className="page-title">Справочник химического состава</h1>

          <div className="header-actions">
            <button className="btn" onClick={() => setCalcOpen(true)}>🧮 Калькулятор пищевой ценности</button>

            {/* Переключатель левого меню */}
            <button className="btn" onClick={() => setSidebarOpen(v => !v)}>
              {sidebarOpen ? "Скрыть параметры" : "Дополнительные параметры"}
            </button>

            <button className="btn" onClick={() => setAddOpen(true)}>Добавить локально</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (window.confirm("Очистить локальную базу? Это удалит все локальные данные.")) {
                  await clearAll();
                }
              }}
            >
              Очистить локальную базу
            </button>
            <button className="btn" onClick={reloadOriginal}>Загрузить исходную базу</button>
            <button type="button" onClick={handleExportCatalog} className="btn">📄 Экспорт таблицы в Excel</button>
          </div>

          {/* Ряд 2: сортировка + поиск */}
          <div className="filters-row">
            <div className="sort-group">
              <SortControl sort={sort} onChange={setSort} />
            </div>
            <div className="search-group">
              <SearchBar value={search} onChange={setSearch} />
            </div>
          </div>
        </header>


        {loading && <div style={{ padding: 16 }}>Загрузка…</div>}
        {error && <div style={{ padding: 16, color: "crimson" }}>Ошибка: {error}</div>}

        {!loading && !error && (
          <div style={{ padding: 16, display: "grid", gap: 24 }}>
            {groups.map(({ typeId, typeName, subgroups }) => {
              const typeKey = getTypeKey({ typeId, typeName });
              const selected = subtypeFilters[typeKey] || [];
              const hasFilter = selected.length > 0;

              const visibleSubgroups = hasFilter
                ? subgroups.filter(sg =>
                    sg.subtypeId != null && selected.includes(sg.subtypeId)
                  )
                : subgroups;

              return (
                <section key={typeKey} style={{ marginBottom: 32 }}>
                  {/* Шапка типа + фильтры по подтипам */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <h2 style={{ margin: 0 }}>{typeName}</h2>

                    <div style={{ fontSize: 13, color: "#444" }}>
                      <div style={{ marginBottom: 4 }}>Выберите подтипы для отображения:</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {subgroups.map(sg => {
                          const id = sg.subtypeId;
                          const labelId = `${typeKey}-sub-${sg.subtypeKey}`;
                          const checked =
                            !hasFilter || (id != null && selected.includes(id));
                          return (
                            <label
                              key={labelId}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 999,
                                border: "1px solid #ddd",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  if (id != null) toggleSubtypeForType(typeKey, id);
                                }}
                              />
                              <span>{sg.subtypeName}</span>
                            </label>
                          );
                        })}

                        {hasFilter && (
                          <button
                            type="button"
                            onClick={() => clearSubtypesForType(typeKey)}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: "1px dashed #999",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            Сбросить
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Подтипы этого типа, с учётом фильтра */}
                  {visibleSubgroups.map(({ subtypeId, subtypeName, items }) => {
                    return (
                      <div key={`${typeKey}::${subtypeId ?? subtypeName}`} style={{ marginLeft: 16, marginBottom: 16 }}>
                        <GroupSection
                          title={subtypeName}
                          items={items}
                          columns={visibleColumns}
                          onSaveRow={saveProduct}
                        />
                      </div>
                    );
                  })}
                </section>
              );
            })}

            <AddProductModal
              open={addOpen}
              onClose={() => setAddOpen(false)}
              onSubmit={addProductLocally}
              types={allTypes}
            />
	            <NutritionCalculatorModal
	              open={calcOpen}
	              onClose={() => setCalcOpen(false)}
	              allProducts={allItems}
	              defaultGrams={100}
	            />
            {groups.length === 0 && (
              <div style={{ color: "#666" }}>Ничего не найдено по текущим фильтрам</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
