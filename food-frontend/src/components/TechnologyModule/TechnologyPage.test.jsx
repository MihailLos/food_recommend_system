import React from "react";
import { fireEvent, render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import {
  createProcessingType, createTechnologyRecord, getTechnologyMatches, getTechnologyOptions, getTechnologyRecord, listTechnologyRecords,
} from "../../api/technology";
import TechnologyPage from "./TechnologyPage";

jest.mock("../../api/technology", () => ({
  createProcessingType: jest.fn(),
  createTechnologyRecord: jest.fn(),
  getTechnologyMatches: jest.fn(),
  getTechnologyOptions: jest.fn(),
  getTechnologyRecord: jest.fn(),
  listTechnologyRecords: jest.fn(),
}));

const batch = {
  id: 3, product_name: "Морковь", sort_name: "Омская", source_place: null, acquisition_date: null,
};

const record = {
  id: 6, batch, weight_g: "173.8", preprocessing: [], heating: [],
  analyses: [{
    id: 9, result_mode: "weighings", final_dry_matter_pct: "11.126",
    avg_dry_residue_g: "0.5563", parallel_count: 2,
    parallels: [
      { parallel_number: 1, m0_g: "10", m1_g: "15", m2_g: "10.5", dry_residue_g: "0.5", dry_matter_pct: "10" },
      { parallel_number: 2, m0_g: "11", m1_g: "16", m2_g: "11.6126", dry_residue_g: "0.6126", dry_matter_pct: "12.252" },
    ],
  }],
};

beforeEach(() => {
  jest.resetAllMocks();
  getTechnologyOptions.mockResolvedValue({ groups: [], subgroups: [], processing_types: [{ id: 7, name: "Варка" }] });
  getTechnologyMatches.mockResolvedValue([batch]);
  listTechnologyRecords.mockResolvedValue({ results: [record] });
  getTechnologyRecord.mockResolvedValue(record);
  createTechnologyRecord.mockResolvedValue(record);
});

function fill(name, value, scope = screen) {
  fireEvent.change(scope.getByLabelText((label) => label.replace(/\s*\*$/, "") === name), { target: { value } });
}

test("focuses the missing field, then saves a new weighing-based record and opens its laboratory details", async () => {
  render(<TechnologyPage />);
  await waitForElementToBeRemoved(() => screen.queryByText("Загрузка справочников…"));
  const save = screen.getByRole("button", { name: "Сохранить результаты" });
  fireEvent.click(save);
  const product = screen.getByRole("textbox", { name: "Название продукта" });
  expect(product).toHaveFocus();
  expect(product).toHaveAccessibleDescription("Заполните обязательное поле.");
  expect(createTechnologyRecord).not.toHaveBeenCalled();

  fill("Название продукта", "Морковь");
  fireEvent.click(screen.getByRole("button", { name: "Внесённые данные" }));
  await screen.findByRole("table", { name: "Внесённые технологические данные" });
  fireEvent.click(screen.getByRole("button", { name: "Ввод данных" }));
  expect(product).toHaveValue("Морковь");
  fill("Масса до обработки, г", "173,8");
  fireEvent.click(screen.getByLabelText("Добавить лабораторный анализ"));
  fill("После какого вида обработки проводилось исследование?", "raw");
  fireEvent.click(screen.getByLabelText("Рассчитать по взвешиваниям"));
  fireEvent.click(screen.getByRole("button", { name: /Добавить параллель/ }));
  [
    ["Параллель 1", "10", "15", "10,5"],
    ["Параллель 2", "11", "16", "11,6126"],
  ].forEach(([name, m0, m1, m2]) => {
    const row = within(screen.getByRole("group", { name }));
    fill("Тара m₀, г", m0, row);
    fill("Бюкс с навеской до сушки m₁, г", m1, row);
    fill("Бюкс с навеской после сушки m₂, г", m2, row);
  });
  expect(screen.getByText("Сухой остаток 0,5 г · 10,00 %")).toBeInTheDocument();
  expect(screen.getByText("Средний сухой остаток 0,5563 г · Сухие вещества 11,13 %")).toBeInTheDocument();

  fireEvent.click(save);
  expect(await screen.findByText("Результаты сохранены.")).toBeInTheDocument();
  expect(createTechnologyRecord).toHaveBeenCalledWith({
    batch: { product_name: "Морковь", sort_name: null, source_place: null, acquisition_date: null, manual: null },
    weight_g: "173.8",
    analysis: {
      stage: "raw", result_mode: "weighings",
      parallels: [
        { m0_g: "10", m1_g: "15", m2_g: "10.5" },
        { m0_g: "11", m1_g: "16", m2_g: "11.6126" },
      ],
    },
  });
  const open = await screen.findByRole("button", { name: /Открыть запись/ });
  expect(screen.getByRole("cell", { name: "11,13" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: /Порция/ })).not.toBeInTheDocument();
  fireEvent.click(open);
  fireEvent.click(await screen.findByRole("button", { name: "Лабораторные данные" }));
  expect(screen.getByText("11,13 %")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Взвешивания по параллелям (2)"));
  expect(screen.getByRole("cell", { name: "12,25" })).toBeInTheDocument();
});

test("adds a result to the selected batch using only the reported percentage", async () => {
  render(<TechnologyPage />);
  fireEvent.click(screen.getByLabelText("Существующая партия"));
  expect(screen.getByRole("searchbox", { name: "Поиск партии по ее номеру или по названию продукта" })).toBeInTheDocument();
  await screen.findByRole("option", { name: /Морковь/ });
  fill("Партия", "3");
  fill("Масса до обработки, г", "180");
  fireEvent.click(screen.getByLabelText("Добавить тепловую обработку"));
  fill("Способ обработки", "7");
  fill("Масса после нагрева, г", "160,5");
  fireEvent.click(screen.getByLabelText("Добавить лабораторный анализ"));
  fill("После какого вида обработки проводилось исследование?", "processed");
  fireEvent.click(screen.getByLabelText("Внести готовый процент"));
  fill("Массовая доля сухих веществ, %", "10,25");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить результаты" }));
  expect(await screen.findByText("Результаты сохранены.")).toBeInTheDocument();
  expect(createTechnologyRecord).toHaveBeenCalledWith({
    batch_id: 3, weight_g: "180",
    heating: {
      cpt: 7, weight_g: "160.5", processing_temperature_celsius: null, added_water_g: null, added_oil_g: null,
    },
    analysis: { stage: "processed", result_mode: "reported", reported_dry_matter_pct: "10.25" },
  });
});

test("adds a processing type to the shared dictionary and selects it for the record", async () => {
  createProcessingType.mockResolvedValue({ id: 21, name: "Запекание в фольге" });
  render(<TechnologyPage />);
  await waitForElementToBeRemoved(() => screen.queryByText("Загрузка справочников…"));
  fill("Название продукта", "Картофель");
  fill("Масса до обработки, г", "180");
  fireEvent.click(screen.getByLabelText("Добавить тепловую обработку"));
  fireEvent.click(screen.getByRole("button", { name: /Добавить свой способ/ }));
  fill("Название нового способа", "  Запекание в фольге ");
  fireEvent.click(screen.getByRole("button", { name: "Добавить в справочник" }));

  const heating = screen.getByRole("combobox", { name: "Способ обработки" });
  await within(heating).findByRole("option", { name: "Запекание в фольге" });
  expect(createProcessingType).toHaveBeenCalledWith("Запекание в фольге");
  expect(heating).toHaveValue("21");
  fireEvent.click(screen.getByLabelText("Добавить первичную обработку"));
  const prep = screen.getByRole("combobox", { name: "Вид первичной обработки" });
  expect(within(prep).getByRole("option", { name: "Запекание в фольге" })).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Добавить первичную обработку"));

  fill("Масса после нагрева, г", "160");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить результаты" }));
  expect(await screen.findByText("Результаты сохранены.")).toBeInTheDocument();
  expect(createTechnologyRecord).toHaveBeenCalledWith(expect.objectContaining({
    heating: expect.objectContaining({ cpt: 21 }),
  }));
});
