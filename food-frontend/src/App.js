import React, { useEffect, useState } from "react";
import ProductsPage from "./components/ProductsPage";
import ConsumerPage from "./components/ConsumerModule/ConsumerPage";
import AuthPage from "./components/Auth/AuthPage";
import { fetchCsrfCookie, fetchCurrentUser, logoutUser } from "./api/auth";
import "./styles/header.css";

const tabBtn = (active) => ({
  padding: "10px 12px",
  border: "1px solid #ddd",
  background: active ? "#fff" : "#f6f7f9",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: active ? 700 : 500,
  flex: "1 1 280px",
  minWidth: 0,
});

export default function App() {
  const [tab, setTab] = useState("auth"); // catalog | consumer | auth
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchCsrfCookie();
        const currentUser = await fetchCurrentUser();
        if (cancelled) return;
        setUser(currentUser);
        setTab("consumer");
      } catch (_e) {
        if (cancelled) return;
        setUser(null);
        setTab("auth");
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = (currentUser) => {
    setUser(currentUser);
    setTab("consumer");
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (_e) {
      // ignore network race on logout; state is still cleared locally
    } finally {
      setUser(null);
      setTab("auth");
    }
  };

  if (authLoading) {
    return <div style={{ minHeight: "100dvh", background: "#f6f7f9", padding: 24 }}>Загрузка…</div>;
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#f6f7f9" }}>
      {/* Верхние вкладки */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#f6f7f9",
          borderBottom: "1px solid #eee",
          padding: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button style={tabBtn(tab === "catalog")} onClick={() => setTab("catalog")}>
          📚 Справочник хим. состава пищевых продуктов
        </button>
        {user ? (
          <>
            <button style={tabBtn(tab === "consumer")} onClick={() => setTab("consumer")}>
              🧑‍⚕️ Модуль потребителя
            </button>
            <button style={tabBtn(false)} onClick={handleLogout}>
              Выйти ({user.username})
            </button>
          </>
        ) : (
          <button style={tabBtn(tab === "auth")} onClick={() => setTab("auth")}>
            🔐 Авторизация
          </button>
        )}
      </div>

      {/* Контент */}
      {tab === "catalog" && <ProductsPage />}
      {tab === "consumer" && user && <ConsumerPage user={user} />}
      {tab === "auth" && !user && <AuthPage onLogin={handleLogin} />}
    </div>
  );
}
