import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { unzipSync } from "fflate";
import ePub from "epubjs";
import "./DocumentViewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function pdfFile(file) { return file.original_name.toLowerCase().endsWith(".pdf"); }
function epubFile(file) { return file.original_name.toLowerCase().endsWith(".epub"); }
function audioFile(file) { return file.kind === "audio" || /\.(mp3|m4a|wav|ogg|webm)$/i.test(file.original_name); }

function PdfPage({ pdf, pageNumber, measures }) {
  const host = useRef(null);
  const canvas = useRef(null);
  const [width, setWidth] = useState(760);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "900px 0px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, Math.floor(entries[0].contentRect.width))));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task;
    async function render() {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, width / base.width) });
      const element = canvas.current;
      const context = element.getContext("2d", { alpha: false });
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.floor(viewport.width * ratio);
      element.height = Math.floor(viewport.height * ratio);
      element.style.width = viewport.width + "px";
      element.style.height = viewport.height + "px";
      setSize({ width: viewport.width, height: viewport.height });
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      task = page.render({ canvasContext: context, viewport });
      await task.promise;
    }
    render().catch(error => { if (!cancelled) console.error("PDF render failed", error); });
    return () => { cancelled = true; task && task.cancel(); };
  }, [pdf, pageNumber, width, visible]);
  return <div className="document-pdf-page" ref={host}>
    <div className="document-pdf-canvas-wrap" style={{ width: size.width || "100%", height: size.height || "auto" }}>
      <canvas ref={canvas} aria-label={"PDF page " + pageNumber}/>
      {measures.filter(m => m.page === pageNumber).map(m => <div key={m.id} className={"score-measure-overlay " + (m.kind === "mistake" ? "mistake" : "current")} style={{ left: (m.x * 100) + "%", top: (m.y * 100) + "%", width: (m.width * 100) + "%", height: (m.height * 100) + "%" }} title={m.label || "Recognised measure"}/>)}
    </div>
    <span className="document-page-number">{pageNumber}</span>
  </div>;
}

export default function DocumentViewer({ file, url, onClose, getToken, onUseForPractice }) {
  const [pdf, setPdf] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [audioTracks, setAudioTracks] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const epubHost = useRef(null);
  const epubBook = useRef(null);
  const rendition = useRef(null);
  const objectUrls = useRef([]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true); setError(""); setPdf(null); setAudioTracks([]);
    async function load() {
      try {
        if (pdfFile(file)) {
          const task = pdfjs.getDocument({ url });
          task.onPassword = (updatePassword, reason) => {
            if (!cancelled) setPasswordRequest({ updatePassword, reason });
          };
          const document = await task.promise;
          if (!cancelled) setPdf(document);
        } else if (epubFile(file)) {
          const book = ePub(url);
          epubBook.current = book;
          await book.ready;
          if (cancelled) return;
          const view = book.renderTo(epubHost.current, { width: "100%", height: "100%", spread: "auto", flow: "paginated" });
          rendition.current = view;
          await view.display();
          try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("EPUB archive unavailable.");
            const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
            const tracks = [];
            for (const path of Object.keys(archive)) {
              if (!/\.(mp3|m4a|wav|ogg)$/i.test(path) || path.endsWith("/")) continue;
              const ext = path.toLowerCase().split(".").pop();
              const type = ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : ext === "ogg" ? "audio/ogg" : "audio/wav";
              const blobUrl = URL.createObjectURL(new Blob([archive[path]], { type }));
              objectUrls.current.push(blobUrl);
              tracks.push({ name: path.split("/").pop(), url: blobUrl });
            }
            if (!cancelled) setAudioTracks(tracks);
          } catch (archiveError) { console.warn("Could not inspect EPUB audio resources", archiveError); }
        } else if (audioFile(file)) {
          setAudioTracks([{ name: file.original_name, url }]);
        } else {
          setError("This file can be stored, but its preview format is not supported yet.");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "This document could not be opened.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      rendition.current && rendition.current.destroy();
      epubBook.current && epubBook.current.destroy();
      objectUrls.current.forEach(URL.revokeObjectURL);
      objectUrls.current = [];
    };
  }, [file.id, url]);

  async function requestAnalysis() {
    setAnalysisBusy(true); setError("");
    try {
      const response = await fetch("/api/uploads?analysis=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + await getToken() },
        body: JSON.stringify({ fileId: file.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Score analysis could not be started.");
      setAnalysis(body.job);
    } catch (requestError) { setError(requestError.message || "Score analysis could not be started."); }
    finally { setAnalysisBusy(false); }
  }

  function submitPassword(event) {
    event.preventDefault();
    if (!passwordRequest || !password.trim()) return;
    passwordRequest.updatePassword(password);
    setPasswordRequest(null);
    setPassword("");
    setBusy(true);
  }



  useEffect(() => {
    if (!analysis?.id || !["queued", "processing"].includes(analysis.status)) return;
    let cancelled = false;
    let timeout;
    async function poll() {
      try {
        const response = await fetch("/api/uploads?analysisJob=" + encodeURIComponent(analysis.id), { headers: { Authorization: "Bearer " + await getToken() } });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Analysis status unavailable.");
        if (!cancelled) setAnalysis(body.job);
      } catch (pollError) { if (!cancelled) setError(pollError.message); }
      if (!cancelled && ["queued", "processing"].includes(analysis.status)) timeout = window.setTimeout(poll, 2500);
    }
    timeout = window.setTimeout(poll, 1200);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [analysis?.id, analysis?.status]);

  const measures = analysis && analysis.result && analysis.result.measures ? analysis.result.measures : [];
  return <section className="document-viewer" aria-label={file.original_name}>
    <header className="document-viewer-toolbar">
      <div className="document-viewer-title"><strong>{file.original_name}</strong><small>{pdfFile(file) ? "PDF document" : epubFile(file) ? "EPUB book" : "Audio reference"}</small></div>
      <div className="document-viewer-actions">
        <button type="button" onClick={requestAnalysis} disabled={analysisBusy || (!pdfFile(file) && !epubFile(file))}>{analysisBusy ? "Starting analysis…" : "Analyse sheet music"}</button>
        {onUseForPractice && <button type="button" onClick={() => onUseForPractice(file, audioTracks[0] || null)}>Use for practice</button>}
        <button type="button" className="document-close" onClick={onClose}>Close</button>
      </div>
    </header>
    {error && <div className="document-error" role="alert">{error}</div>}
    {analysis && <div className="document-analysis-status"><strong>Score analysis: {analysis.status}</strong>{analysis.message && <span>{analysis.message}</span>}</div>}
    {busy && <div className="document-loading">Opening your document…</div>}
    {passwordRequest && <form className="document-password" onSubmit={submitPassword}>
      <strong>This PDF is password protected</strong><p>Enter the password supplied with your legitimate copy.</p>
      <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} autoFocus/>
      <button type="submit" disabled={!password.trim()}>Unlock PDF</button>
    </form>}
    {pdf && <div className="document-pdf-scroll">{Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index + 1} pdf={pdf} pageNumber={index + 1} measures={measures}/>)}</div>}
    {epubFile(file) && <div className="document-epub-host" ref={epubHost}/>}
    {audioTracks.length > 0 && <div className="document-audio-tracks"><strong>Audio included with this book</strong>{audioTracks.map(track => <div key={track.url}><span>{track.name}</span><audio controls preload="metadata" src={track.url}/></div>)}</div>}
  </section>;
}
