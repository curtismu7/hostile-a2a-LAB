import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "../App.jsx";
import { catalog, mockFetch } from "./fixtures.js";

beforeEach(() => { localStorage.clear(); window.location.hash = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.present; });

// The header's Mock/Real control now lives in the shared TopMenu (a select, data-testid="mode-select").
const banner = () => screen.getByTestId("banner");

test("the banner says MOCK before the server answers and when /api/info fails", () => {
  vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog })));
  render(<App />);
  expect(banner()).toHaveTextContent(/^MOCK mode\. This A2A agent is deliberately hostile\./);
  expect(banner()).toHaveAttribute("data-state", "mock");
});

test("the banner follows /api/info: MOCK for mock, REAL and the live edge for real", async () => {
  vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog, "GET /api/info": { mode: "local", hosted: false, source: "mock", realAvailable: true } })));
  const { unmount } = render(<App />);
  await waitFor(() => expect(screen.getByTestId("mode-select")).toHaveValue("mock"));
  expect(banner()).toHaveTextContent(/^MOCK mode\./);
  expect(banner()).toHaveAttribute("data-state", "mock");
  unmount();
  vi.stubGlobal("fetch", vi.fn(mockFetch({ "GET /api/catalog": catalog, "GET /api/info": { mode: "local", hosted: false, source: "real", realAvailable: true } })));
  render(<App />);
  await waitFor(() => expect(banner()).toHaveTextContent(/^REAL mode\. This A2A agent is deliberately hostile\./));
  expect(banner()).toHaveAttribute("data-state", "live");
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
  await screen.findByTestId("banner");
  const real = screen.getByTestId("mode-select").querySelector('option[value="real"]');
  expect(real).toBeDisabled();
  expect(real.getAttribute("title")).toMatch(/no live version/);
});
