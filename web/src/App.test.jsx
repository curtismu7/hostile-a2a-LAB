import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App, { PAGES } from "./App.jsx";
import { catalog, mockFetch } from "./test/fixtures.js";

beforeEach(() => { localStorage.clear(); window.location.hash = ""; vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.present; });

test("the hostile-server banner and the skip link are on every page", async () => {
  render(<App />);
  expect(screen.getByTestId("banner")).toHaveTextContent(/deliberately hostile/i);
  expect(screen.getByTestId("banner")).toHaveTextContent(/inert/i);
  expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  for (const [id, label] of PAGES) {
    window.location.hash = `#/${id}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("banner")).toBeInTheDocument();
  }
});

test("the standard shell: a shell bar, the mock banner first in main, one h1 that names the page", async () => {
  render(<App />);
  expect(document.querySelectorAll("header.shell-bar")).toHaveLength(1);
  const main = screen.getByRole("main");
  expect(main.firstElementChild).toBe(screen.getByTestId("banner"));
  expect(screen.getByTestId("banner")).toHaveTextContent(/MOCK mode/);
  expect(screen.getByTestId("banner")).toHaveAttribute("data-state", "mock");
  const titles = [["gallery", "Card poison gallery"], ["run", "Run the delegation"], ["roundtrip", "Card round trip: the agent changed overnight"], ["limits", "Honest limits"], ["diagram", "How the pin sits in the path"]];
  for (const [id, title] of titles) {
    window.location.hash = `#/${id}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  }
});

test("the five pages are gallery, run, round trip, limits and diagram", () => {
  expect(PAGES.map(([id]) => id)).toEqual(["gallery", "run", "roundtrip", "limits", "diagram"]);
});

test("the theme picker and the presenter toggle set the presenter flag", async () => {
  render(<App />);
  await userEvent.selectOptions(screen.getByTestId("theme-select"), "light");
  expect(document.documentElement.dataset.theme).toBe("light");
  await userEvent.selectOptions(screen.getByTestId("theme-select"), "dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  const present = screen.getByTestId("presenter");
  await userEvent.click(present);
  expect(present).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement.dataset.present).toBe("1");
});
