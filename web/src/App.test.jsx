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

test("the five pages are gallery, run, round trip, limits and diagram", () => {
  expect(PAGES.map(([id]) => id)).toEqual(["gallery", "run", "roundtrip", "limits", "diagram"]);
});

test("the theme button cycles and the presenter toggle sets the presenter flag", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /Theme: system/ }));
  expect(document.documentElement.dataset.theme).toBe("light");
  await userEvent.click(screen.getByRole("button", { name: /Theme: light/ }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  const present = screen.getByRole("button", { name: "Present" });
  await userEvent.click(present);
  expect(present).toHaveAttribute("aria-pressed", "true");
  expect(document.documentElement.dataset.present).toBe("1");
});
