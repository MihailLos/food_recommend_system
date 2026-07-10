import React, { useEffect, useMemo, useState } from "react";
import useDebounce from "../hooks/useDebounce";
import useCatalog from "../hooks/useCatalog";
import SearchBar from "../components/SearchBar";
import GroupSection from "../components/GroupSection";
import ColumnPicker from "../components/ColumnPicker";
import FiltersPanel from "../components/FiltersPanel";
import SortControl from "../components/SortControl";
import AddProductModal from "../components/AddProductModal";
import AdminCatalogModal from "../components/AdminCatalogModal";
import NutritionCalculatorModal from "../components/NutritionCalculatorModal";
import RetailProductsPage from "./RetailProducts/RetailProductsPage";
import { ALL_COLUMNS } from "../config/column";
import { exportJsonToExcel } from "../utils/exportExcel";

/** утилиты */
function applyFilters(items, filters) {
  let out = items;

  // группа
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


export default function ProductsPage({ catalogScope, isAuthenticated, user }) {
  const [catalogView, setCatalogView] = useState("reference");
  const isSuperUser = Boolean(user?.is_superuser);
  // поиск по серверу как раньше
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const {
    loading,
    error,
    items,
    allItems,
    saveProduct,
    addProductLocally,
    clearAll,
    reloadOriginal,
    localVersion,
    remoteVersion,
    hasUpdate,
    syncReady,
    statusMessage,
    isReloading,
    reloadProgress,
  } = useCatalog(debounced, catalogScope);
  const [calcOpen, setCalcOpen] = useState(false);
  const [subtypeFilters, setSubtypeFilters] = useState({});

  // для модалки
  const [addOpen, setAddOpen] = useState(false);
  const [adminModalMode, setAdminModalMode] = useState(null);
  const [adminStatusMessage, setAdminStatusMessage] = useState("");

  // уникальные группы для селекта
  const types = useMemo(() => {
    const map = new Map();
    for (const r of items) if (r.typeId) map.set(r.typeId, r.typeName || `Группа #${r.typeId}`);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a,b)=>String(a.name).localeCompare(String(b.name), "ru"));
  }, [items]);

  const allTypes = useMemo(() => {
    const map = new Map();
    for (const r of allItems) if (r.typeId) map.set(r.typeId, r.typeName || `Группа #${r.typeId}`);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a,b)=>String(a.name).localeCompare(String(b.name), "ru"));
  }, [allItems]);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("sidebarOpen");
    return saved === null ? true : saved === "true";
  });
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false
  );
  useEffect(() => {
    localStorage.setItem("sidebarOpen", String(sidebarOpen));
  }, [sidebarOpen]);
  useEffect(() => {
    const onResize = () => setIsMobileLayout(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      // если все сняли – можно удалить запись, чтобы «нет фильтра» = «все подгруппы»
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

  // группировка по группам
  const groups = useMemo(() => {
  const byType = new Map();

  for (const r of filteredSorted) {
    const typeKey = r.typeId ?? `type:${r.typeName ?? "?"}`;
    const typeName = r.typeName || `Группа #${r.typeId ?? "?"}`;

    if (!byType.has(typeKey)) {
      byType.set(typeKey, {
        typeId: r.typeId ?? null,
        typeName,
        subMap: new Map(),
      });
    }

    const typeGroup = byType.get(typeKey);

    const subtypeKey = r.subtypeId ?? `sub:${r.subtypeName ?? "?"}`;
    const subtypeName = r.subtypeName || `Подгруппа #${r.subtypeId ?? "?"}`;

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
        "Группа": item.typeName || "",
        "Подгруппа": item.subtypeName || "",
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

  const handleAdminDone = (message) => {
    setAdminModalMode(null);
    setAdminStatusMessage(`${message} Нажмите «Загрузить исходную базу», чтобы подтянуть серверные изменения в текущий локальный справочник.`);
  };

  return (
    <div className="app-products-layout" data-sidebar={sidebarOpen ? "open" : "closed"}>
      {catalogView === "reference" && isReloading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(2px)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              border: "1px solid #dfe5dc",
              borderRadius: 16,
              boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
              padding: 20,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 18 }}>Загрузка исходной базы</div>
            <div style={{ color: "#555", lineHeight: 1.5 }}>
              Текущий локальный каталог будет заменён исходной версией с сервера.
            </div>
            <div
              style={{
                height: 12,
                borderRadius: 999,
                background: "#edf3ec",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, reloadProgress || 0))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #2e7d32 0%, #66bb6a 100%)",
                  transition: "width 180ms ease",
                }}
              />
            </div>
            <div style={{ color: "#2e7d32", fontWeight: 700, textAlign: "right" }}>
              {Math.max(0, Math.min(100, reloadProgress || 0))}%
            </div>
          </div>
        </div>
      )}
      {catalogView === "reference" && isMobileLayout && sidebarOpen && (
        <div className="app-mobile-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          padding: "16px 16px 0",
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={() => setCatalogView("reference")}
          style={{
            borderColor: catalogView === "reference" ? "#2e7d32" : undefined,
            background: catalogView === "reference" ? "rgba(46,125,50,0.08)" : undefined,
            fontWeight: catalogView === "reference" ? 700 : 500,
          }}
        >
          Эталонный справочник
        </button>
        {isAuthenticated && (
          <button
            type="button"
            className="btn"
            onClick={() => setCatalogView("retail")}
            style={{
              borderColor: catalogView === "retail" ? "#2e7d32" : undefined,
              background: catalogView === "retail" ? "rgba(46,125,50,0.08)" : undefined,
              fontWeight: catalogView === "retail" ? 700 : 500,
            }}
          >
            Магазинные продукты
          </button>
        )}
      </div>
      {catalogView === "retail" && isAuthenticated ? (
        <main className="app-products-main" style={{ gridColumn: "1 / -1" }}>
          <RetailProductsPage catalogProducts={allItems} />
        </main>
      ) : (
        <>
      {/* Сайдбар */}
      <aside className="app-products-sidebar" data-sidebar={sidebarOpen ? "open" : "closed"} aria-hidden={!sidebarOpen}>
        {/* Чтобы красиво прятать содержимое, оборачиваем в контейнер с opacity */}
        <div
          className="app-products-sidebar-inner"
          data-sidebar={sidebarOpen ? "open" : "closed"}
          style={{
            opacity: sidebarOpen ? 1 : 0,
            pointerEvents: sidebarOpen ? "auto" : "none",
          }}
        >
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
      <main className="app-products-main">
        <header className="page-header">
          {/* Ряд 1: заголовок + действия */}
          <h1 className="page-title">Справочник хим. состава пищевых продуктов</h1>

          <div className="header-actions">
            <button className="btn" onClick={() => setCalcOpen(true)}>🧮 Калькулятор пищевой ценности</button>

            {/* Переключатель левого меню */}
            <button className="btn" onClick={() => setSidebarOpen(v => !v)}>
              {sidebarOpen
                ? (isMobileLayout ? "Закрыть фильтры" : "Скрыть параметры")
                : (isMobileLayout ? "Фильтры и столбцы" : "Дополнительные параметры")}
            </button>

            <button className="btn" onClick={() => setAddOpen(true)}>Добавить локально</button>
            {isSuperUser && (
              <>
                <button className="btn" onClick={() => setAdminModalMode("add")}>Добавить в серверную базу данных</button>
                <button className="btn" onClick={() => setAdminModalMode("edit")}>Изменить серверную базу данных</button>
                <button className="btn btn-danger" onClick={() => setAdminModalMode("delete")}>Удалить продукт из базы данных</button>
              </>
            )}
            <button className="btn" onClick={reloadOriginal} disabled={isReloading}>
              {isReloading ? "Загрузка базы..." : "Загрузить исходную базу"}
            </button>
            <button type="button" onClick={handleExportCatalog} className="btn">📄 Экспорт таблицы в Excel</button>
          </div>

          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e0e0e0",
              background: "#fff",
              fontSize: 13,
              lineHeight: 1.5,
              color: "#444",
            }}
          >
            <div>
              Локальная база: {isAuthenticated ? "персональная для текущего пользователя" : "временная гостевая сессия"}
            </div>
            <div>
              Scope: <code>{catalogScope}</code>
            </div>
            <div>
              Локальная версия: <strong>{localVersion || "не загружена"}</strong>
              {syncReady && remoteVersion ? (
                <> · Серверная версия: <strong>{remoteVersion}</strong></>
              ) : null}
            </div>
            {hasUpdate ? (
              <div style={{ color: "#8a6d1d", marginTop: 6 }}>
                База данных на сервере обновилась. Нажмите «Загрузить исходную базу», чтобы подтянуть новую версию.
              </div>
            ) : (
              syncReady && localVersion && remoteVersion && (
                <div style={{ color: "#1f5f26", marginTop: 6 }}>Локальная база актуальна.</div>
              )
            )}
            {statusMessage && (
              <div style={{ color: "#1f5f26", marginTop: 6 }}>{statusMessage}</div>
            )}
            {adminStatusMessage && (
              <div style={{ color: "#1f5f26", marginTop: 6 }}>{adminStatusMessage}</div>
            )}
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "#666" }}>Сервисные действия</summary>
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <div style={{ color: "#666", fontSize: 12 }}>
                  Очистка локальной базы нужна только для полного сброса текущего локального каталога,
                  например если вы хотите начать с пустой базы или исправить повреждённый локальный кеш.
                </div>
                <div>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      if (window.confirm("Очистить локальную базу? Это удалит все локальные данные текущего каталога.")) {
                        await clearAll();
                      }
                    }}
                  >
                    Очистить локальную базу
                  </button>
                </div>
              </div>
            </details>
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
                  {/* Шапка группы + фильтры по подгруппам */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <h2 style={{ margin: 0 }}>{typeName}</h2>

                    <div style={{ fontSize: 13, color: "#444", minWidth: 0 }}>
                      <div style={{ marginBottom: 4 }}>Выберите подгруппы для отображения:</div>
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

                  {/* Подгруппы этой группы, с учётом фильтра */}
                  {visibleSubgroups.map(({ subtypeId, subtypeName, items }) => {
                    return (
                      <div key={`${typeKey}::${subtypeId ?? subtypeName}`} style={{ marginLeft: isMobileLayout ? 0 : 16, marginBottom: 16 }}>
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
      {adminModalMode && (
        <AdminCatalogModal
          mode={adminModalMode}
          allItems={allItems}
          onClose={() => setAdminModalMode(null)}
          onDone={handleAdminDone}
        />
      )}
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
        </>
      )}
    </div>
  );
}
