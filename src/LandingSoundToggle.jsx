import { useEffect, useRef, useState } from "react";

export default function LandingSoundToggle() {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.master.gain.setTargetAtTime(0, audio.context.currentTime, .2);
      window.setTimeout(() => audio.context.close().catch(() => {}), 600);
    } catch {}
  }, []);

  async function toggle() {
    if (enabled) {
      const audio = audioRef.current;
      if (audio) {
        audio.master.gain.setTargetAtTime(0, audio.context.currentTime, .35);
        window.setTimeout(() => audio.context.close().catch(() => {}), 1000);
        audioRef.current = null;
      }
      setEnabled(false);
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);
      const frequencies = [110, 164.81, 220, 329.63];
      frequencies.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const voice = context.createGain();
        oscillator.type = index === 2 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        voice.gain.value = index === 0 ? .12 : .035;
        oscillator.connect(voice);
        voice.connect(master);
        oscillator.start();
      });
      master.gain.setTargetAtTime(.075, context.currentTime, 1.4);
      audioRef.current = { context, master };
      setEnabled(true);
    } catch {
      setEnabled(false);
    }
  }

  return <button type="button" className={"lp-sound-toggle" + (enabled ? " active" : "")} onClick={toggle} aria-pressed={enabled} aria-label={enabled ? "Turn ambient sound off" : "Turn ambient sound on"}>
    <span className="lp-sound-bars" aria-hidden="true"><i/><i/><i/><i/></span>
    <span>{enabled ? "Sound on" : "Sound off"}</span>
  </button>;
}
