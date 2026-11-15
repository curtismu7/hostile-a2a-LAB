import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// The family's shared stylesheet first (tokens, controls, dark mode, banner), then this app's own layout.
import "./standalone-ui.css";
import "./top-menu/top-menu.css";
// The shared JSON pane (Rule 24): Form | JSON toggle, theme-token colors, full view. Vendored, never edited.
import "./components/JsonPane.css";
import "./app.css";

createRoot(document.getElementById("root")).render(<App />);
