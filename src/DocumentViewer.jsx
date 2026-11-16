import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { unzipSync } from "fflate";
import ePub from "epubjs";
import { musicXmlToMusicCoach, mergeMusicXmlPages } from "./musiccoach-format.js";
import { createOmrClient } from "./omr/omrClient.js";
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
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [pageRange, setPageRange] = useState("1");
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
    setAnalysisBusy(true); setError(""); setAnalysis(null); setAnalysisProgress("Preparing on-device recognition…");
    let client = null;
    try {
      const sourcePages = [];
      let selectedPageNumbers = [];
      if (pdfFile(file)) {
        if (!pdf) throw new Error("Wait until the PDF has finished opening, then try again.");
        selectedPageNumbers = parsePageRange(pageRange, pdf.numPages);
        for (const pageNumber of selectedPageNumbers) {
          setAnalysisProgress("Preparing original book page " + pageNumber + " of " + pdf.numPages + "…");
          const page = await pdf.getPage(pageNumber);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2.5, 2200 / base.width) });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport }).promise;
          const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Page " + pageNumber + " could not be rasterised.")), "image/png"));
          sourcePages.push({ pageNumber, blob });
        }
      } else if (epubFile(file)) {
        const response = await fetch(url);
        if (!response.ok) throw new Error("The original EPUB could not be read locally.");
        const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
        const entries = Object.keys(archive).filter(path => /\\.(png|jpe?g|webp|svg)$/i.test(path) && !path.endsWith("/")).sort();
        if (!entries.length) throw new Error("This EPUB has no embedded score-page images. Export the score pages as a PDF or upload a MusicXML score to analyse them.");
        selectedPageNumbers = parsePageRange(pageRange, entries.length);
        for (const pageNumber of selectedPageNumbers) {
          const path = entries[pageNumber - 1];
          const ext = path.toLowerCase().split(".").pop();
          const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          const blob = await imageBlobAsPng(new Blob([archive[path]], { type: mime }));
          sourcePages.push({ pageNumber, blob });
        }
      }
      if (!sourcePages.length) throw new Error("No score pages were selected.");
      client = createOmrClient({
        onProgress: message => {
          if (message.stage === "download") {
            const percent = Math.min(100, Math.round((Number(message.loaded) / Math.max(1, Number(message.total))) * 100));
            setAnalysisProgress("Downloading and caching the on-device OMR model · " + percent + "%");
          } else if (message.stage === "python") setAnalysisProgress("Starting the local notation engine…");
          else if (message.stage === "retry") setAnalysisProgress("Resuming a model download…");
        },
        onLog: message => { if (/WebGPU|WASM|Loaded/i.test(message)) setAnalysisProgress(message); },
      });
      setAnalysisProgress("Loading the on-device OMR engine. First use downloads about 151 MB; later use is cached in this browser.");
      await client.ready;
      const pageXml = [];
      for (let index = 0; index < sourcePages.length; index += 1) {
        const page = sourcePages[index];
        setAnalysisProgress("Recognising notation · page " + page.pageNumber + " (" + (index + 1) + " of " + sourcePages.length + ")…");
        const result = await client.recognise(page.blob);
        if (!result.xml || !/<(?:\\w+:)?score-partwise\\b/i.test(result.xml)) {
          throw new Error("The OMR engine could not recognise a complete score on page " + page.pageNumber + ". Try a clearer scan or select a page containing notation.");
        }
        pageXml.push(result.xml);
      }
      const mergedXml = mergeMusicXmlPages(pageXml);
      const analysisDocument = musicXmlToMusicCoach(mergedXml, file.id, file.original_name, {
        engine: "homr-browser",
        sourcePages: selectedPageNumbers,
        requiresReview: true,
        generatedAt: new Date().toISOString(),
      });
      const output = new Blob([JSON.stringify(analysisDocument)], { type: "application/json" });
      const filename = file.original_name.replace(/\\.[^.]+$/, "") + ".musiccoach";
      const token = await getToken();
      const signedResponse = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ filename, contentType: "application/json", size: output.size, purpose: "library", category: "other", analysisOnly: true, sourceFileId: file.id }),
      });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed.error || "The MusicCoach analysis file could not be saved.");
      const uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: output });
      if (!uploaded.ok) throw new Error("Secure storage rejected the MusicCoach analysis file.");
      const completedResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ fileId: signed.fileId, purpose: "library" }),
      });
      const completed = await completedResponse.json();
      if (!completedResponse.ok) throw new Error(completed.error || "The MusicCoach analysis file could not be verified.");
      setAnalysis({ status: "completed", message: "Notation recognised on this device and saved as a linked MusicCoach analysis file. Check the recognition before relying on it." });
      setAnalysisProgress("");
    } catch (requestError) {
      setError(requestError.message || "The score could not be recognised on this device.");
      setAnalysisProgress("");
    } finally {
      client?.terminate();
      setAnalysisBusy(false);
    }
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
        {(pdfFile(file) || epubFile(file)) && <label className="document-page-range">Pages to recognise<input value={pageRange} onChange={event => setPageRange(event.target.value)} placeholder="e.g. 4-6" aria-label="Pages to recognise"/></label>}
        <button type="button" onClick={requestAnalysis} disabled={analysisBusy || (!pdfFile(file) && !epubFile(file)) || (pdfFile(file) && !pdf)}>{analysisBusy ? "Recognising…" : "Analyse on this device"}</button>
        {onUseForPractice && <button type="button" onClick={() => onUseForPractice(file, audioTracks[0] || null)}>Use for practice</button>}
        <button type="button" className="document-close" onClick={onClose}>Close</button>
      </div>
    </header>
    {error && <div className="document-error" role="alert">{error}</div>}
    {analysisProgress && <div className="document-analysis-status"><strong>{analysisProgress}</strong></div>}{analysis && <div className="document-analysis-status"><strong>Score analysis: {analysis.status}</strong>{analysis.message && <span>{analysis.message}</span>}</div>}
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
