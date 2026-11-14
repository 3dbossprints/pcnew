import { useEffect, useState } from "react";
import { adminApi } from "./lib/admin-api.js";
import { sanitizeLegalHtml } from "../api/_lib/legal-html.js";
import "./SiteLegal.css";

const PUBLIC_PATHS = { privacy: "/privacy", terms: "/terms" };

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminLegalPages() {
  const [pages, setPages] = useState({});
  const [slug, setSlug] = useState("privacy");
  const [draft, setDraft] = useState("");
  const [view, setView] = useState("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ tone: "", text: "" });

  useEffect(() => {
    let active = true;
    adminApi("/api/billing/admin-site-pages")
      .then(body => {
        if (!active) return;
        if (!Array.isArray(body?.pages)) throw new Error("Legal pages returned an unexpected response.");
        const bySlug = Object.fromEntries(body.pages.map(page => [page.slug, page]));
        setPages(bySlug);
        setDraft(bySlug.privacy?.html ?? "");
      })
      .catch(error => active && setNotice({ tone: "error", text: error.message }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const saved = pages[slug]?.html ?? "";
  const dirty = draft !== saved;

  function choosePage(next) {
    if (next === slug) return;
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setSlug(next);
    setDraft(pages[next]?.html ?? "");
    setNotice({ tone: "", text: "" });
  }

  async function save() {
    setSaving(true);
    setNotice({ tone: "", text: "" });
    try {
      const body = await adminApi("/api/billing/admin-site-pages", { method: "PUT", body: { slug, html: draft } });
      if (!body?.page) throw new Error("The page could not be saved. Please try again.");
      setPages(current => ({ ...current, [slug]: body.page }));
      setDraft(body.page.html);
      setNotice({ tone: "success", text: "Saved. The public page is up to date." });
    } catch (error) {
      setNotice({ tone: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="legal-admin-panel"><p className="legal-admin-muted">Loading legal pages...</p></section>;

  const page = pages[slug];
  const title = page?.title || (slug === "privacy" ? "Privacy Policy" : "Terms of Service");

  return <section className="legal-admin-panel">
    <header className="legal-admin-head">
      <div>
        <h2>{title}</h2>
        <p className="legal-admin-muted">{saved.trim() ? (page?.updatedAt ? "Last saved " + formatDate(page.updatedAt) + (page.updatedBy ? " by " + page.updatedBy : "") : "Saved") : "This page is blank and not yet published."}</p>
      </div>
      <a className="legal-admin-link" href={PUBLIC_PATHS[slug]} target="_blank" rel="noreferrer">View live page</a>
    </header>

    <div className="legal-admin-toolbar">
      <div className="legal-segment" role="tablist" aria-label="Choose a page">
        {Object.keys(PUBLIC_PATHS).map(key => <button key={key} role="tab" aria-selected={slug === key} className={slug === key ? "active" : ""} onClick={() => choosePage(key)}>{key === "privacy" ? "Privacy" : "Terms"}</button>)}
      </div>
      <div className="legal-segment" role="tablist" aria-label="Editor mode">
        <button role="tab" aria-selected={view === "edit"} className={view === "edit" ? "active" : ""} onClick={() => setView("edit")}>HTML</button>
        <button role="tab" aria-selected={view === "preview"} className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}>Preview</button>
      </div>
    </div>

    <div className="legal-admin-editor">
      {view === "edit" ? <textarea
        value={draft}
        onChange={event => setDraft(event.target.value)}
        spellCheck={false}
        aria-label={title + " HTML"}
        placeholder="<h2>1. Introduction</h2>&#10;<p>Write your policy here.</p>"
      /> : <article className="legal-doc legal-admin-preview" dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(draft) }} />}
      {view === "preview" && !draft.trim() && <p className="legal-admin-muted">Nothing to preview yet.</p>}
    </div>

    <footer className="legal-admin-foot">
      <p className={notice.tone ? "legal-admin-notice " + notice.tone : "legal-admin-muted"} role="status">
        {notice.text || (dirty ? "Unsaved changes" : "All changes saved")}
      </p>
      <button className="legal-admin-primary" onClick={save} disabled={!dirty || saving}>{saving ? "Saving..." : "Publish changes"}</button>
    </footer>
  </section>;
}
