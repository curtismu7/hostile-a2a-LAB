import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "../App.jsx";
import { catalog, mockFetch } from "./fixtures.js";

beforeEach(() => { localStorage.clear(); window.location.hash = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.present; });

// The header's Mock/Real control now lives in the shared TopMenu (a select, data-testid="mode-select").
const modal = () => screen.getByTestId("mode-modal");

test("the modal says MOCK before the server answers and when /api/info fails, with the hostile-on-purpose line", () => {
  vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog })));
  render(<App />);
  expect(modal()).toHaveTextContent(/MOCK/);
  expect(modal()).toHaveTextContent(/This A2A agent is deliberately hostile\./);
  expect(modal()).toHaveAttribute("data-mode", "mock");
  expect(screen.queryByTestId("banner")).toBeNull();
});

test("the modal follows /api/info: MOCK for mock, then REAL with the live edge named (held /api/info: MOCK first, REAL after it answers)", async () => {
  vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog, "GET /api/info": { mode: "local", hosted: false, source: "mock", realAvailable: true } })));
  const { unmount } = render(<App />);
  await waitFor(() => expect(screen.getByTestId("mode-select")).toHaveValue("mock"));
  expect(modal()).toHaveAttribute("data-mode", "mock");
  unmount();
  let release;
  const held = new Promise((r) => { release = r; });
  const inner = mockFetch({ "GET /api/catalog": catalog, "GET /api/info": { mode: "local", hosted: false, source: "real", realAvailable: true } });
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => { if (url === "/api/info") await held; return inner(url, init); }));
  render(<App />);
  await screen.findByRole("main");
  expect(modal()).toHaveAttribute("data-mode", "mock");
  release();
  await waitFor(() => expect(modal()).toHaveAttribute("data-mode", "real"));
  expect(modal()).toHaveTextContent(/REAL/);
  expect(modal()).toHaveTextContent(/deliberately hostile/);
  expect(modal()).toHaveTextContent(/Only the Privilege gateway check is live/);
});

test("Got it closes the modal for the session; MOCK dismissed does not hide REAL after a switch", async () => {
  vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog, "GET /api/info": { mode: "local", hosted: false, source: "mock", realAvailable: true }, "POST /api/mode": (b) => ({ mode: "local", hosted: false, source: b.source, realAvailable: true }) })));
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("mode-select")).toHaveValue("mock"));
  fireEvent.click(screen.getByTestId("mode-modal-ok"));
  expect(screen.queryByTestId("mode-modal")).toBeNull();
  fireEvent.change(screen.getByTestId("mode-select"), { target: { value: "real" } });
  await waitFor(() => expect(modal()).toHaveAttribute("data-mode", "real"));
});

test("the page loads /api/info into the header mode and asks for the switch through /api/mode", async () => {
  const calls = [];
  const routes = {
    "GET /api/catalog": catalog,
    "GET /api/info": { mode: "local", hosted: false, source: "real", realAvailable: true },
    "POST /api/mode": (b) => ({ mode: "local", hosted: false, source: b.source, realAvailable: true }),
  };
  const inner = mockFetch(routes);
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => { calls.push({ url, init }); return inner(url, init); }));
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("mode-select")).toHaveValue("real"));
  fireEvent.change(screen.getByTestId("mode-select"), { target: { value: "mock" } });
  await waitFor(() => expect(screen.getByTestId("mode-select")).toHaveValue("mock"));
  expect(JSON.parse(calls.find((c) => c.url === "/api/mode").init.body)).toEqual({ source: "mock" });
});

test("mock only: the Real option is disabled with the reason", async () => {
  vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog, "GET /api/info": { mode: "local", hosted: false, source: "mock", realAvailable: false } })));
  render(<App />);
  await screen.findByTestId("mode-modal");
  const real = screen.getByTestId("mode-select").querySelector('option[value="real"]');
  expect(real).toBeDisabled();
  expect(real.getAttribute("title")).toMatch(/no live version/);
});
