import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

export default function MusicXMLViewer({ xml, title = "Sheet music", currentMeasure = null, className = "" }) {
  const host = useRef(null);
  const display = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let instance = null;
    setStatus("loading");
    setError("");
    async function render() {
      try {
        if (!host.current) return;
        instance = new OpenSheetMusicDisplay(host.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
          drawSubtitle: false,
          drawComposer: true,
          drawPartNames: false,
          followCursor: false,
          pageFormat: "Endless",
          cursorsOptions: [{ type: 0, color: "#9dc183", alpha: 0.18, follow: false }]
        });
        display.current = instance;
        await instance.load(xml);
        if (cancelled) return;
        instance.render();
        setStatus("ready");
      } catch (reason) {
        if (!cancelled) { setError(reason?.message || "This MusicXML score could not be rendered."); setStatus("error"); }
      }
    }
    render();
    return () => {
      cancelled = true;
      try { instance?.clear(); } catch {}
      display.current = null;
      if (host.current) host.current.replaceChildren();
    };
  }, [xml]);
  return <section className={"pc-musicxml-viewer " + className} aria-label={title}>
    {status === "loading" && <div className="pc-inline-status">Preparing the sheet music…</div>}
    {status === "error" && <div className="pc-inline-error" role="alert">{error}</div>}
    <div className="pc-musicxml-canvas" ref={host} />
    {status === "ready" && currentMeasure && <span className="pc-measure-hint">Current detected bar: {currentMeasure}</span>}
  </section>;
}
