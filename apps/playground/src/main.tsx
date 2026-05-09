import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const host = document.getElementById("root");
if (!host) {
  throw new Error("Playground bootstrap: missing #root element in index.html");
}

createRoot(host).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
