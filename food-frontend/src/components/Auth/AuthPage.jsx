import React, { useEffect, useMemo, useState } from "react";

import { fetchCsrfCookie, loginUser, registerUser } from "../../api/auth";
import { fetchAllergens, fetchWorkGroups } from "../../api/consumer";

const box = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d0d7de",
  boxSizing: "border-box",
  background: "#fff",
};

const btn = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d0d7de",
  background: "#fff",
  cursor: "pointer",
};

const passwordInput = {
  ...input,
  paddingRight: 92,
};

const primaryBtn = {
  ...btn,
  borderColor: "#2e7d32",
  color: "#1f5f26",
  fontWeight: 700,
};

const row = {
  display: "grid",
  gap: 10,
  alignItems: "center",
  marginBottom: 10,
};

const goalHint = {
  marginTop: 8,
  padding: 12,
  borderRadius: 10,
  background: "rgba(249,168,37,0.10)",
  border: "1px solid rgba(249,168,37,0.35)",
  color: "#7b5a00",
  fontSize: 13,
  lineHeight: 1.5,
};

const passwordRules = {
  fontSize: 13,
  color: "#666",
  lineHeight: 1.5,
};

const initialRegisterForm = {
  username: "",
  password: "",
  display_name: "",
  sex: "male",
  age_years: "",
  height_cm: "",
  weight_kg: "",
  work_group_id: "",
  has_minor_children: false,
  allergen_ids: [],
};

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [loginForm, setLoginForm] = useState({ username: "", password: "", remember_me: true });
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [workGroups, setWorkGroups] = useState([]);
  const [allergens, setAllergens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchCsrfCookie();
        const [wgRaw, alRaw] = await Promise.all([fetchWorkGroups(), fetchAllergens()]);
        if (cancelled) return;
        setWorkGroups(normalizeList(wgRaw));
        setAllergens(normalizeList(alRaw));
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Не удалось загрузить справочники для регистрации.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasAnyProfileData = useMemo(() => {
    return Boolean(
      registerForm.display_name.trim() ||
      registerForm.age_years ||
      registerForm.height_cm ||
      registerForm.weight_kg ||
      registerForm.work_group_id ||
      registerForm.has_minor_children ||
      registerForm.allergen_ids.length > 0
    );
  }, [registerForm]);

  const toggleAllergen = (id) => {
    setRegisterForm((prev) => {
      const set = new Set(prev.allergen_ids);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, allergen_ids: Array.from(set) };
    });
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await fetchCsrfCookie();
      const user = await loginUser(loginForm);
      onLogin?.(user);
    } catch (e) {
      setError(
        e?.response?.data?.detail ||
        e?.response?.data?.error ||
        e?.message ||
        "Не удалось войти."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await fetchCsrfCookie();
      const payload = {
        username: registerForm.username.trim(),
        password: registerForm.password,
      };

      if (hasAnyProfileData) {
        payload.display_name = registerForm.display_name.trim() || null;
        payload.sex = registerForm.sex;
        payload.age_years = registerForm.age_years ? Number(registerForm.age_years) : undefined;
        payload.height_cm = registerForm.height_cm ? Number(registerForm.height_cm) : undefined;
        payload.weight_kg = registerForm.weight_kg ? Number(registerForm.weight_kg) : undefined;
        payload.work_group_id = registerForm.work_group_id ? Number(registerForm.work_group_id) : undefined;
        payload.has_minor_children = Boolean(registerForm.has_minor_children);
        payload.allergen_ids = registerForm.allergen_ids;
      }

      const data = await registerUser(payload);
      setMessage(data?.detail || "Регистрация выполнена. Теперь войдите в систему.");
      setMode("login");
      setLoginForm((prev) => ({ ...prev, username: registerForm.username.trim(), password: "", remember_me: true }));
      setRegisterForm(initialRegisterForm);
    } catch (e) {
      const details = e?.response?.data;
      setError(typeof details === "string" ? details : JSON.stringify(details || e?.message || "Ошибка регистрации"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ ...box, padding: 18, display: "grid", gap: 14, maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={mode === "login" ? primaryBtn : btn} onClick={() => setMode("login")}>
            Вход
          </button>
          <button type="button" style={mode === "register" ? primaryBtn : btn} onClick={() => setMode("register")}>
            Регистрация
          </button>
        </div>

        <div style={{ color: "#666", fontSize: 14, lineHeight: 1.5 }}>
          Справочник химического состава доступен без авторизации. Модуль потребителя доступен только после входа в систему.
        </div>

        {message && <div style={{ color: "#1f5f26" }}>{message}</div>}
        {error && <div style={{ color: "crimson" }}>{error}</div>}

        {mode === "login" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={row} className="app-form-row">
              <label>Логин</label>
              <input
                style={input}
                value={loginForm.username}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
              />
            </div>
            <div style={row} className="app-form-row">
              <label>Пароль</label>
              <div style={{ position: "relative" }}>
                <input
                  style={passwordInput}
                  type={showLoginPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <button
                  type="button"
                  style={{
                    ...btn,
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    padding: "6px 10px",
                    fontSize: 12,
                  }}
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                >
                  {showLoginPassword ? "Скрыть" : "Показать"}
                </button>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={loginForm.remember_me}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, remember_me: e.target.checked }))}
              />
              Запомнить пароль
            </label>
            <div>
              <button type="button" style={primaryBtn} onClick={handleLogin} disabled={loading}>
                {loading ? "Выполняется..." : "Войти"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={row} className="app-form-row">
              <label>Логин</label>
              <input
                style={input}
                value={registerForm.username}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, username: e.target.value }))}
              />
            </div>
            <div style={row} className="app-form-row">
              <label>Пароль</label>
              <div style={{ position: "relative" }}>
                <input
                  style={passwordInput}
                  type={showRegisterPassword ? "text" : "password"}
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <button
                  type="button"
                  style={{
                    ...btn,
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    padding: "6px 10px",
                    fontSize: 12,
                  }}
                  onClick={() => setShowRegisterPassword((prev) => !prev)}
                >
                  {showRegisterPassword ? "Скрыть" : "Показать"}
                </button>
              </div>
              <div style={passwordRules}>
                Пароль должен содержать не менее 8 символов, не быть слишком похожим на логин,
                не быть слишком распространённым и не состоять только из цифр.
              </div>
            </div>

            <div style={goalHint}>
              Параметры профиля можно заполнить позже во вкладке профиля, но они необходимы для работы алгоритма рекомендаций.
            </div>

            <div style={{ fontWeight: 700 }}>Необязательные параметры профиля</div>

            <div style={row} className="app-form-row">
              <label>Название профиля</label>
              <input
                style={input}
                value={registerForm.display_name}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, display_name: e.target.value }))}
                placeholder="Например: Основной профиль"
              />
            </div>
            <div style={row} className="app-form-row">
              <label>Пол</label>
              <select
                style={input}
                value={registerForm.sex}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, sex: e.target.value }))}
              >
                <option value="male">Мужчина</option>
                <option value="female">Женщина</option>
              </select>
            </div>
            <div style={row} className="app-form-row">
              <label>Возраст (лет)</label>
              <input
                style={input}
                type="number"
                value={registerForm.age_years}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, age_years: e.target.value }))}
              />
            </div>
            <div style={row} className="app-form-row">
              <label>Рост (см)</label>
              <input
                style={input}
                type="number"
                value={registerForm.height_cm}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, height_cm: e.target.value }))}
              />
            </div>
            <div style={row} className="app-form-row">
              <label>Вес (кг)</label>
              <input
                style={input}
                type="number"
                value={registerForm.weight_kg}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, weight_kg: e.target.value }))}
              />
            </div>
            <div style={row} className="app-form-row">
              <label>Группа труда</label>
              <select
                style={input}
                value={registerForm.work_group_id}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, work_group_id: e.target.value }))}
              >
                <option value="">— выбрать —</option>
                {workGroups
                  .filter((g) => String(g.id) !== "5" || Number(registerForm.age_years) >= 65)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={registerForm.has_minor_children}
                onChange={(e) => setRegisterForm((prev) => ({ ...prev, has_minor_children: e.target.checked }))}
              />
              Есть несовершеннолетние дети
            </label>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Аллергены</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {allergens.map((item) => {
                  const active = registerForm.allergen_ids.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleAllergen(item.id)}
                      style={{
                        ...btn,
                        borderRadius: 999,
                        borderColor: active ? "#2e7d32" : "#ddd",
                        background: active ? "rgba(46,125,50,0.08)" : "#fff",
                        padding: "6px 10px",
                        fontSize: 13,
                      }}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <button type="button" style={primaryBtn} onClick={handleRegister} disabled={loading}>
                {loading ? "Выполняется..." : "Зарегистрироваться"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
