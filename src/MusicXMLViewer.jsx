import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

function normaliseMeasures(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0))]
    .sort((a, b) => a - b);
}

function moveCursorToMeasure(cursor, measureNumber) {
  if (!cursor || !Number.isInteger(Number(measureNumber)) || Number(measureNumber) < 1) {
    cursor?.hide?.();
    return;
  }
  cursor.reset();
  for (let index = 1; index < Number(measureNumber); index += 1) cursor.nextMeasure();
  cursor.update();
  cursor.show();
}

export default function MusicXMLViewer({
  xml,
  title = "Sheet music",
  currentMeasure = null,
  highlightMeasures = [],
  focusMeasure = null,
  className = "",
}) {
  const host = useRef(null);
  const display = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const measures = normaliseMeasures(highlightMeasures);
  const measureKey = measures.join(",");
  const activeMeasure = Number(currentMeasure);
  const focusedMeasure = Number(focusMeasure);

  useEffect(() => {
    let cancelled = false;
    let instance = null;
    setStatus("loading");
    setError("");
    async function render() {
      try {
        if (!host.current) return;
        const cursorsOptions = [
          { type: 0, color: "#9dc183", alpha: 0.18, follow: false },
          { type: 3, color: "#9dc183", alpha: 0.22, follow: false },
          ...measures.map(() => ({ type: 3, color: "#e28b4c", alpha: 0.28, follow: false })),
        ];
        instance = new OpenSheetMusicDisplay(host.current, {
          autoResize: true,
          backend: "svg",
          drawTitle: true,
          drawSubtitle: false,
          drawComposer: true,
          drawPartNames: false,
          followCursor: false,
          pageFormat: "Endless",
          cursorsOptions,
        });
        display.current = instance;
        await instance.load(xml);
        if (cancelled) return;
        instance.render();
        instance.enableOrDisableCursors?.(true);
        setStatus("ready");
      } catch (reason) {
        if (!cancelled) {
          setError(reason?.message || "This MusicXML score could not be rendered.");
          setStatus("error");
        }
      }
    }
    render();
    return () => {
      cancelled = true;
      try { instance?.clear(); } catch {}
      display.current = null;
      if (host.current) host.current.replaceChildren();
    };
  }, [xml, measures.length]);

  useEffect(() => {
    if (status !== "ready") return;
    const cursors = display.current?.cursors || [];
    // The first cursor is reserved for note-level playback. Measure cursors are
    // separate so feedback highlights never leak into ordinary score viewing.
    cursors[0]?.hide?.();
    moveCursorToMeasure(cursors[1], Number.isInteger(activeMeasure) && activeMeasure > 0 ? activeMeasure : null);
    measures.forEach((measure, index) => moveCursorToMeasure(cursors[index + 2], measure));

    const focusIndex = measures.indexOf(focusedMeasure);
    const focusCursor = focusIndex >= 0 ? cursors[focusIndex + 2] : null;
    focusCursor?.cursorElement?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [status, activeMeasure, measureKey, focusedMeasure]);

  return <section className={"pc-musicxml-viewer " + className} aria-label={title}>
    {status === "loading" && <div className="pc-inline-status">Preparing the sheet music…</div>}
    {status === "error" && <div className="pc-inline-error" role="alert">{error}</div>}
    <div className="pc-musicxml-canvas" ref={host} />
    {status === "ready" && Number.isInteger(activeMeasure) && activeMeasure > 0 && <span className="pc-measure-hint">Current detected bar: {activeMeasure}</span>}
  </section>;
}
