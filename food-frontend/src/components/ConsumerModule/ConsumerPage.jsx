// src/components/ConsumerModule/ConsumerPage.jsx
import React, { useState } from "react";
import ConsumerProfilesTab from "./ConsumerProfilesTab";
import ConsumerGoalsTab from "./ConsumerGoalsTab";
import RecommendationsTab from "./RecommendationsTab";

const box = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
};

const tabBtn = (active) => ({
  padding: "8px 12px",
  border: "1px solid #ddd",
  background: active ? "rgba(46,125,50,0.08)" : "#fff",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: active ? 700 : 500,
});

export default function ConsumerPage({ catalogScope }) {
  const [tab, setTab] = useState("profiles"); // profiles | goals
  const [selectedProfileId, setSelectedProfileId] = useState(null);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ ...box, padding: 14, display: "flex", gap: 8 }}>
        <button
          type="button"
          style={tabBtn(tab === "profiles")}
          onClick={() => setTab("profiles")}
        >
          Профили
        </button>
        <button
          type="button"
          style={tabBtn(tab === "goals")}
          onClick={() => setTab("goals")}
          disabled={!selectedProfileId}
          title={!selectedProfileId ? "Сначала выберите профиль" : ""}
        >
          Цели питания
        </button>
        <button
          type="button"
          style={tabBtn(tab === "reco")}
          onClick={() => setTab("reco")}
          disabled={!selectedProfileId}
          title={!selectedProfileId ? "Сначала выберите профиль" : ""}
        >
          Рекомендации
        </button>
      </div>

      {tab === "profiles" && (
        <ConsumerProfilesTab
          selectedProfileId={selectedProfileId}
          onSelectProfile={setSelectedProfileId}
        />
      )}

      {tab === "goals" && (
        <ConsumerGoalsTab profileId={selectedProfileId} />
      )}

      {tab === "reco" && 
        <RecommendationsTab profileId={selectedProfileId} catalogScope={catalogScope} />
      }
    </div>
  );
}
