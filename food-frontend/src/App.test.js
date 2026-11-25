import { fireEvent, render, screen } from "@testing-library/react";
import { fetchCsrfCookie, fetchCurrentUser } from "./api/auth";
import App from "./App";

jest.mock("./api/auth", () => ({
  fetchCsrfCookie: jest.fn(),
  fetchCurrentUser: jest.fn(),
  logoutUser: jest.fn(),
}));
jest.mock("./components/ProductsPage", () => () => null);
jest.mock("./components/ConsumerModule/ConsumerPage", () => () => <div>Профили потребителя</div>);
jest.mock("./components/Auth/AuthPage", () => () => <div>Вход в систему</div>);
jest.mock("./components/TechnologyModule/TechnologyPage", () => () => <div>Форма технолога</div>);

test("staff can open the technological module", async () => {
  fetchCsrfCookie.mockResolvedValue();
  fetchCurrentUser.mockResolvedValue({ id: 1, username: "technologist", is_staff: true });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "🧪 Технологический модуль" }));
  expect(screen.getByText("Форма технолога")).toBeInTheDocument();
});

test("consumer accounts do not get the technological module tab", async () => {
  fetchCsrfCookie.mockResolvedValue();
  fetchCurrentUser.mockResolvedValue({ id: 2, username: "consumer", is_staff: false });
  render(<App />);

  expect(await screen.findByText("Профили потребителя")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Технологический модуль/ })).not.toBeInTheDocument();
});
