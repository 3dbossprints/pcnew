import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import AuthGate from "./AuthGate.jsx";
import OnboardingGate from "./OnboardingGate.jsx";
import "./styles.css";
import "./premium-motion.css";

const isAdminRoute = window.location.pathname.replace(/\/+$/, "") === "/admin";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      {isAdminRoute
        ? <AdminDashboard onExit={() => window.location.assign("/")} />
        : <OnboardingGate><App /></OnboardingGate>}
    </AuthGate>
  </React.StrictMode>
);
