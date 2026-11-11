import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test } from "vitest";
import StoryPanel from "./StoryPanel.jsx";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

test("the Allowed/Blocked switch changes the wording of a step that has a blocked version", async () => {
  render(<StoryPanel mode="roundtrip" />);
  await userEvent.click(screen.getByRole("button", { name: /3\s*Compare/ }));
  expect(screen.getByText(/The ungoverned client uses fetch #2 as it comes/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Blocked" }));
  expect(screen.getByText(/refuses the changed card until/)).toBeInTheDocument();
  expect(screen.getByText(/Proof:/).parentElement).toHaveTextContent(/reported as changed with a field diff, withheld/);
});

test("the steps are one exclusive selector: a named group, aria-pressed on the selected step only, no aria-current", async () => {
  render(<StoryPanel mode="roundtrip" />);
  const group = screen.getByRole("group", { name: "Talk track steps" });
  const pressed = () => within(group).getAllByRole("button").map((b) => b.getAttribute("aria-pressed"));
  expect(pressed()).toEqual(["true", "false", "false", "false", "false"]);
  expect(group.querySelector("[aria-current]")).toBeNull();
  await userEvent.click(within(group).getByRole("button", { name: /3\s*Compare/ }));
  expect(pressed()).toEqual(["false", "false", "true", "false", "false"]);
  expect(screen.getByRole("group", { name: "Story path" })).toBeInTheDocument();
});

test("the vertical re-skins the story and is remembered", async () => {
  render(<StoryPanel mode="roundtrip" />);
  expect(screen.getByText(/Story S22 · Generic/)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Vertical"), "banking");
  expect(screen.getByText(/Story S22 · Super Banking/)).toBeInTheDocument();
  expect(screen.getByText(/reviews the refunds specialist.s Agent Card for the bank/)).toBeInTheDocument();
  cleanup();
  render(<StoryPanel mode="roundtrip" />);
  expect(screen.getByText(/Story S22 · Super Banking/)).toBeInTheDocument();
});

test("the panel hides, stays open in presenter mode, and a page with no story renders nothing", async () => {
  const { rerender, container } = render(<StoryPanel mode="run" />);
  expect(screen.getByText("The card told my agent to include my token")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Hide talk track" }));
  expect(screen.queryByText("Goal")).toBeNull();
  rerender(<StoryPanel mode="run" present />);
  expect(screen.getByText("Goal")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /talk track/ })).toBeDisabled();
  rerender(<StoryPanel mode="limits" />);
  expect(container).toBeEmptyDOMElement();
});
