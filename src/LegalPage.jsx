import { useEffect, useState } from "react";
import { sanitizeLegalHtml } from "../api/_lib/legal-html.js";
import "./SiteLegal.css";

const OTHER_PAGES = {
  privacy: { path: "/terms", label: "Terms of Service" },
  terms: { path: "/privacy", label: "Privacy Policy" },
};

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function LegalPage({ slug }) {
  const [state, setState] = useState({ status: "loading", page: null, message: "" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", page: null, message: "" });
    fetch("/api/billing/site-page?slug=" + encodeURIComponent(slug))
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "This page could not be loaded.");
        if (!body.page || typeof body.page.html !== "string") throw new Error("This page could not be loaded.");
        return body.page;
      })
      .then(page => active && setState({ status: "ready", page, message: "" }))
      .catch(error => active && setState({ status: "error", page: null, message: error.message }));
    return () => { active = false; };
  }, [slug]);

  const other = OTHER_PAGES[slug];
  const page = state.page;
  const hasContent = page && page.html.trim();

  return <main className="legal-shell">
    <nav className="legal-top" aria-label="Legal navigation">
      <a className="legal-home" href="/">Piano Coach</a>
      {other && <a href={other.path}>{other.label}</a>}
    </nav>
    <article className="legal-card">
      {state.status === "loading" && <p className="legal-muted">Loading...</p>}
      {state.status === "error" && <p className="legal-muted" role="alert">{state.message}</p>}
      {state.status === "ready" && <>
        <h1>{page.title}</h1>
        {page.updatedAt && <p className="legal-meta">Last updated {formatDate(page.updatedAt)}</p>}
        {hasContent
          ? <div className="legal-doc" dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(page.html) }} />
          : <p className="legal-muted">This page has not been published yet.</p>}
      </>}
    </article>
  </main>;
}
