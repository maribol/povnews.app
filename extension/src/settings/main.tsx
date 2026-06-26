import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "./Settings";
import "../newtab/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Settings />
  </StrictMode>,
);
