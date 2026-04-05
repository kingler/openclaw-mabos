import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// Apply theme before first render to prevent flash
const storedTheme = localStorage.getItem("mabos-theme");
if (
  storedTheme === "dark" ||
  (!storedTheme && !document.documentElement.classList.contains("light"))
) {
  document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
