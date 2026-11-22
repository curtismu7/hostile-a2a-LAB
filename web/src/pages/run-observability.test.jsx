// Rule 27 on the Run page: the shared panel sits under the Run result; empty before a run; Mock only; honest about errors.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Run from "./Run.jsx";
import { setJsonView } from "../components/JsonPane.jsx";
import { mockRecord, realRecord } from "../run-observability/fixtures.js";
import { mockFetch, run } from "../test/fixtures.js";

beforeEach(() => { localStorage.clear(); window.location.hash = ""; setJsonView("form"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const stub = (routes) => { const f = vi.fn(mockFetch({ "POST /api/run-victim": (b) => run(b.mode, { landed: true }), ...routes })); vi.stubGlobal("fetch", f); return f; };
const go = () => userEvent.click(screen.getByRole("button", { name: "Run both clients" }));

test("before a run the panel shows its empty state and where the logs live", () => {
  stub({});
  render(<Run />);
  expect(screen.getByTestId("ro-empty")).toHaveTextContent("Run the demo");
  expect(screen.getByTestId("ro-streams")).toHaveTextContent("demo-logs-hostile-a2a");
});

test("after a run the record the server built is shown under the result, labelled simulated, and the request carries the run's fields", async () => {
  const f = stub({ "POST /api/run-observability": mockRecord });
  render(<Run />);
  await go();
  expect(await screen.findByTestId("ro-lanes")).toBeInTheDocument();
  expect(screen.getByTestId("ro-basis")).toHaveTextContent("Simulated");
  const call = f.mock.calls.find(([url]) => url === "/api/run-observability");
  expect(JSON.parse(call[1].body)).toMatchObject({ task: "Please refund my last order", stage: "later", variant: "poisoned" });
  const result = screen.getByTestId("result-pinned");
  const panel = screen.getByTestId("run-observability");
  expect(result.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(panel.querySelectorAll('tr[data-origin="logged"]')).toHaveLength(0);
  expect(panel.querySelectorAll('tr[data-origin="simulated"]').length).toBeGreaterThan(0);
});

test("a failed collection is named in the panel and the run result stays", async () => {
  stub({});
  render(<Run />);
  await go();
  expect(await screen.findByTestId("ro-error")).toHaveTextContent("no mock for POST /api/run-observability");
  expect(screen.getByTestId("result-pinned")).toBeInTheDocument();
});

test("a record whose source differs from the page is refused on screen", async () => {
  stub({ "POST /api/run-observability": realRecord });
  render(<Run />);
  await go();
  expect(await screen.findByTestId("ro-mismatch")).toBeInTheDocument();
});

test("in Real the page offers no record and asks the server for none", async () => {
  const f = stub({});
  render(<Run source="real" />);
  await go();
  expect(await screen.findByTestId("result-pinned")).toBeInTheDocument();
  expect(screen.getByTestId("ro-real-not-offered")).toHaveTextContent("not offered");
  expect(screen.queryByTestId("run-observability")).toBeNull();
  expect(f.mock.calls.some(([url]) => url === "/api/run-observability")).toBe(false);
});

test("switching Mock to Real to Mock keeps both working", async () => {
  stub({ "POST /api/run-observability": mockRecord });
  const { rerender } = render(<Run source="mock" />);
  await go();
  expect(await screen.findByTestId("ro-lanes")).toBeInTheDocument();
  rerender(<Run source="real" />);
  expect(screen.getByTestId("ro-real-not-offered")).toBeInTheDocument();
  rerender(<Run source="mock" />);
  expect(screen.getByTestId("run-observability")).toBeInTheDocument();
  await go();
  expect(await screen.findByTestId("ro-lanes")).toBeInTheDocument();
});
