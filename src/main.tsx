import React from "react";
import { createRoot } from "react-dom/client";
import { Bench } from "./components/bench/Bench";
import { AppErrorBoundary } from "./components/bench/AppErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><AppErrorBoundary><Bench /></AppErrorBoundary></React.StrictMode>);
