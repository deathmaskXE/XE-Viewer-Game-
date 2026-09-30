import React from "react";
import { createRoot } from "react-dom/client";
import { Bench } from "./components/bench/Bench";
import { AppErrorBoundary } from "./components/bench/AppErrorBoundary";
import "./styles.css";

// Bloquear el menú contextual en toda la página, incluidos los paneles.
document.addEventListener("contextmenu", (event) => event.preventDefault(), { capture: true });

createRoot(document.getElementById("root")!).render(<React.StrictMode><AppErrorBoundary><Bench /></AppErrorBoundary></React.StrictMode>);
