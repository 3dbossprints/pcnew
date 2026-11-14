import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import AuthGate from "./AuthGate.jsx";
import LegalPage from "./LegalPage.jsx";
import OnboardingGate from "./OnboardingGate.jsx";
import "./styles.css";
import "./premium-motion.css";

const pathname = window.location.pathname.replace(/\/+$/, "");
const isAdminRoute = pathname === "/admin";
const LEGAL_SLUGS = new Map([["/privacy", "privacy"], ["/terms", "terms"]]);
const legalSlug = LEGAL_SLUGS.get(pathname);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {legalSlug
      ? <LegalPage slug={legalSlug} />
      : <AuthGate>
          {isAdminRoute
            ? <AdminDashboard onExit={() => window.location.assign("/")} />
            : <OnboardingGate><App /></OnboardingGate>}
        </AuthGate>}
  </React.StrictMode>
);
