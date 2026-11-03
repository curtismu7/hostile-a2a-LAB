import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "../App.jsx";
import ModeToggle from "../components/ModeToggle.jsx";
import { catalog, mockFetch } from "./fixtures.js";

beforeEach(() => { localStorage.clear(); window.location.hash = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.present; });

test("mock only: Mock is pressed and Real is disabled with the reason", () => {
  render(<ModeToggle info={{ mode: "local", hosted: false, source: "mock", realAvailable: false }} onSelect={() => {}} />);
  expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("mode-real")).toBeDisabled();
  expect(screen.getByTestId("mode-real")).toHaveAttribute("title", expect.stringMatching(/no live version/));
});

test("hosted: Real is disabled saying the hosted build is Mock only", () => {
  render(<ModeToggle info={{ mode: "se-mock", hosted: true, source: "mock", realAvailable: false }} onSelect={() => {}} />);
  expect(screen.getByTestId("mode-real")).toBeDisabled();
  expect(screen.getByTestId("mode-real")).toHaveAttribute("title", "The hosted build is Mock only.");
});

test("when Real is available the buttons switch both ways and the pressed one does nothing", () => {
  const picked = [];
  const { rerender } = render(<ModeToggle info={{ hosted: false, source: "mock", realAvailable: true }} onSelect={(s) => picked.push(s)} />);
  fireEvent.click(screen.getByTestId("mode-mock"));
  expect(picked).toEqual([]);
  fireEvent.click(screen.getByTestId("mode-real"));
  expect(picked).toEqual(["real"]);
  rerender(<ModeToggle info={{ hosted: false, source: "real", realAvailable: true }} onSelect={(s) => picked.push(s)} />);
  fireEvent.click(screen.getByTestId("mode-mock"));
  expect(picked).toEqual(["real", "mock"]);
});

test("before the server answers both buttons are disabled", () => {
  render(<ModeToggle info={null} onSelect={() => {}} />);
  expect(screen.getByTestId("mode-mock")).toBeDisabled();
  expect(screen.getByTestId("mode-real")).toBeDisabled();
});

test("the page loads /api/info into the header toggle and asks for the switch through /api/mode", async () => {
  const calls = [];
  const routes = {
    "GET /api/catalog": catalog,
    "GET /api/info": { mode: "local", hosted: false, source: "real", realAvailable: true },
    "POST /api/mode": (b) => ({ mode: "local", hosted: false, source: b.source, realAvailable: true }),
  };
  const inner = mockFetch(routes);
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => { calls.push({ url, init }); return inner(url, init); }));
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("mode-real")).toHaveAttribute("aria-pressed", "true"));
  fireEvent.click(screen.getByTestId("mode-mock"));
  await waitFor(() => expect(screen.getByTestId("mode-mock")).toHaveAttribute("aria-pressed", "true"));
  expect(JSON.parse(calls.find((c) => c.url === "/api/mode").init.body)).toEqual({ source: "mock" });
});
