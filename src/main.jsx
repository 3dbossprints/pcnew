import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthGate from "./AuthGate.jsx";
import OnboardingGate from "./OnboardingGate.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><AuthGate><OnboardingGate><App /></OnboardingGate></AuthGate></React.StrictMode>
);
