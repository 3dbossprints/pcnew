import { useEffect, useRef, useState } from "react";

const MESSAGES = [
  "Personalising your dashboard",
  "Setting up your practice space",
  "Bringing your progress together",
  "Loading your music"
];

function detectPitch(buffer, sampleRate) {
  let energy = 0;
  for (let i = 0; i < buffer.length; i += 2) energy += buffer[i] * buffer[i];
  const rms = Math.sqrt(energy / Math.max(1, Math.ceil(buffer.length / 2)));
  if (rms < 0.012) return { level: rms, pitch: null };
  const minLag = Math.max(2, Math.floor(sampleRate / 900));
  const maxLag = Math.min(Math.floor(sampleRate / 75), Math.floor(buffer.length / 3));
  let bestLag = -1, best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0, count = 0;
    for (let i = 0; i < buffer.length - maxLag; i += 4) {
      correlation += buffer[i] * buffer[i + lag];
      count += 1;
    }
    correlation /= Math.max(1, count);
    if (correlation > best) { best = correlation; bestLag = lag; }
  }
  return { level: rms, pitch: bestLag > 0 && best > 0.002 ? sampleRate / bestLag : null };
}

export default function PianoLoader({ variant = "loading", onComplete, enableMicrophone = false }) {
  const surfaceRef = useRef(null);
  const canvasRef = useRef(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, lastX: 0.5, lastY: 0.5, movedAt: 0 });
  const ripplesRef = useRef([]);
  const micDataRef = useRef({ level: 0, pitch: null });
  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [micActive, setMicActive] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [micError, setMicError] = useState("");
  const isIntro = variant === "intro";

  useEffect(() => {
    if (!isIntro) {
      const timer = window.setInterval(() => setMessageIndex(index => (index + 1) % MESSAGES.length), 2400);
      return () => window.clearInterval(timer);
    }
    const timer = window.setTimeout(() => onComplete?.(), 3000);
    return () => window.clearTimeout(timer);
  }, [isIntro, onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    let frame = 0, animation = 0, width = 0, height = 0, lastTime = 0;
    const resize = () => {
      const rect = surface.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width; height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = timestamp => {
      const delta = Math.min(40, timestamp - (lastTime || timestamp));
      lastTime = timestamp; frame += 1;
      ctx.clearRect(0, 0, width, height);
      const mic = micDataRef.current;
      const level = Math.min(1, mic.level * 8);
      const pointer = pointerRef.current;
      const pitchPosition = mic.pitch ? Math.max(0, Math.min(1, (mic.pitch - 110) / 770)) : pointer.x;
      const amplitude = 12 + level * 82;
      const base = height * 0.49;
      const spacing = Math.max(1, width / 700);
      for (let layer = 0; layer < 5; layer += 1) {
        const phase = timestamp * (0.00034 + layer * 0.000045) + layer * 1.4;
        const centre = width * pitchPosition;
        ctx.beginPath();
        for (let x = 0; x <= width; x += spacing) {
          const focus = Math.exp(-Math.pow((x - centre) / Math.max(100, width * 0.24), 2));
          let displacement = Math.sin(x * (0.007 + layer * 0.001) + phase) * amplitude * (0.32 + focus * 0.68);
          displacement += Math.sin(x * 0.017 - phase * 0.72 + layer) * (4 + level * 22) * focus;
          for (const ripple of ripplesRef.current) {
            const distance = Math.hypot(x - ripple.x, base + displacement - ripple.y);
            const ring = Math.abs(distance - ripple.radius);
            if (ring < 34) displacement += Math.sin((34 - ring) / 34 * Math.PI) * ripple.strength * (1 - ripple.age) * 0.12;
          }
          const y = base + (layer - 2) * 21 + displacement;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = layer === 2 ? "rgba(123, 158, 103, .48)" : `rgba(157, 193, 131, ${0.13 + (4 - layer) * 0.025})`;
        ctx.lineWidth = layer === 2 ? 1.8 : 1.1;
        ctx.stroke();
      }
      ripplesRef.current = ripplesRef.current.filter(ripple => ripple.age < 1);
      for (const ripple of ripplesRef.current) {
        ripple.age += delta / ripple.life;
        ripple.radius = ripple.age * ripple.maxRadius;
        ctx.beginPath(); ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(128, 164, 109, ${Math.max(0, 0.26 * (1 - ripple.age))})`;
        ctx.lineWidth = 1.2 + (1 - ripple.age) * 1.4; ctx.stroke();
      }
      if (micActive && audioContextRef.current?.analyser && frame % 5 === 0) {
        const analyser = audioContextRef.current.analyser;
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        micDataRef.current = detectPitch(samples, audioContextRef.current.context.sampleRate);
      } else if (!micActive) {
        micDataRef.current.level *= 0.94;
        micDataRef.current.pitch = null;
      }
      animation = window.requestAnimationFrame(draw);
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(surface);
    window.addEventListener("resize", resize);
    animation = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(animation);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [micActive]);

  useEffect(() => {
    if (!enableMicrophone || isIntro) return undefined;
    let cancelled = false;
    async function requestMicrophone() {
      setMicBusy(true);
      setMicError("");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is not available in this browser. The visualiser will still respond to your pointer.");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error("Live microphone analysis is not supported here. The visualiser will still respond to your pointer.");
        const context = new AudioContextClass();
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.72;
        context.createMediaStreamSource(stream).connect(analyser);
        try { await context.resume(); } catch {}
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          await context.close().catch(() => {});
          return;
        }
        micStreamRef.current = stream;
        audioContextRef.current = { context, analyser };
        setMicActive(true);
      } catch (error) {
        if (!cancelled) {
          micStreamRef.current?.getTracks().forEach(track => track.stop());
          micStreamRef.current = null;
          setMicError(error?.message || "Microphone permission was not granted. The visualiser will still respond to your pointer.");
        }
      } finally {
        if (!cancelled) setMicBusy(false);
      }
    }
    requestMicrophone();
    return () => { cancelled = true; };
  }, [enableMicrophone, isIntro]);

  useEffect(() => () => {
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    audioContextRef.current?.context?.close?.().catch?.(() => {});
  }, []);

  function addRipple(event, strength = 1) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    ripplesRef.current.push({ x, y, radius: 0, maxRadius: Math.max(rect.width, rect.height) * (strength > 1 ? 1.5 : 0.48), age: 0, life: strength > 1 ? 1450 : 850, strength });
    if (ripplesRef.current.length > 16) ripplesRef.current.shift();
  }

  function handlePointerMove(event) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const pointer = pointerRef.current;
    pointer.x = x; pointer.y = y;
    if (Math.hypot(x - pointer.lastX, y - pointer.lastY) > 0.095 && performance.now() - pointer.movedAt > 100) {
      addRipple(event, 0.65);
      pointer.lastX = x; pointer.lastY = y; pointer.movedAt = performance.now();
    }
  }

  async function toggleMicrophone() {
    if (!micStreamRef.current) {
      setMicBusy(true); setMicError("");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone input is not available in this browser.");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error("Live microphone analysis is not supported in this browser.");
        const context = new AudioContextClass();
        await context.resume();
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.72;
        context.createMediaStreamSource(stream).connect(analyser);
        micStreamRef.current = stream;
        audioContextRef.current = { context, analyser };
        setMicActive(true);
      } catch (error) {
        micStreamRef.current?.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
        setMicError(error?.message || "Microphone permission was not granted.");
      } finally { setMicBusy(false); }
      return;
    }
    micStreamRef.current.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;
    await audioContextRef.current?.context?.close?.().catch?.(() => {});
    audioContextRef.current = null;
    micDataRef.current = { level: 0, pitch: null };
    setMicActive(false); setMicError("");
  }

  return <main ref={surfaceRef} className="pc-loading-visualizer" onPointerMove={handlePointerMove} onPointerDown={event => addRipple(event, 1.8)} aria-live="polite">
    <canvas ref={canvasRef} className="pc-loading-canvas" aria-hidden="true"/>
    <div className="pc-loading-topline"><img src="/assets/logos/piano-coach-mark.png" alt="Piano Coach"/><span>LISTEN · LEARN · PLAY</span></div>
    <section className="pc-loading-content">
      <span className="pc-loading-eyebrow">{isIntro ? "WELCOME TO PIANO COACH" : "YOUR SPACE IS COMING TOGETHER"}</span>
      <h1>{isIntro ? <>A little space<br/><em>to get in tune.</em></> : <>Your music,<br/><em>in motion.</em></>}</h1>
      <p className="pc-loading-message">{isIntro ? "Take a breath. Your next chapter starts here." : MESSAGES[messageIndex]}</p>
      <div className="pc-loading-progress" aria-hidden="true"><span/></div>
      <div className="pc-loading-mic">
        <button type="button" className={micActive ? "is-active" : ""} onClick={toggleMicrophone} disabled={micBusy}>
          <span aria-hidden="true">{micActive ? "●" : "◌"}</span>{micBusy ? "Requesting microphone…" : micActive ? "Microphone active · Turn off" : "Try microphone again"}
        </button>
        <small>{micError || (micActive ? "Live pitch and loudness shape the waves. Audio stays in this browser." : enableMicrophone ? "Move your pointer or click anywhere to send ripples while microphone access is pending." : "Move your pointer or click anywhere to send ripples. Microphone is optional.")}</small>
      </div>
    </section>
    <div className="pc-loading-footer"><span>PIANO COACH</span><span>PERSONALISING YOUR PRACTICE</span></div>
  </main>;
}
