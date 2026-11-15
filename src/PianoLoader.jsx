import { useEffect, useRef, useState } from "react";

const MESSAGES = [
  "Tuning your musical space",
  "Preparing your next session",
  "Bringing your progress together",
];

export default function PianoLoader({ variant = "loading", onComplete }) {
  const [soundOn, setSoundOn] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const audioRef = useRef(null);
  const isIntro = variant === "intro";

  useEffect(() => {
    if (!isIntro) {
      const timer = window.setInterval(() => setMessageIndex(index => (index + 1) % MESSAGES.length), 1900);
      return () => window.clearInterval(timer);
    }
    const timer = window.setTimeout(() => onComplete?.(), 4200);
    return () => window.clearTimeout(timer);
  }, [isIntro, onComplete]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.master.gain.setTargetAtTime(0, audio.context.currentTime, .15);
      window.setTimeout(() => audio.context.close().catch(() => {}), 500);
    } catch {}
  }, []);

  async function toggleSound() {
    if (soundOn) {
      const audio = audioRef.current;
      if (audio) {
        audio.master.gain.setTargetAtTime(0, audio.context.currentTime, .3);
        window.setTimeout(() => audio.context.close().catch(() => {}), 900);
        audioRef.current = null;
      }
      setSoundOn(false);
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = new AudioContextClass();
      const master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);
      const notes = [110, 164.81, 220];
      const oscillators = notes.map((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index === 1 ? "sine" : "triangle";
        oscillator.frequency.value = frequency;
        gain.gain.value = index === 0 ? .11 : .045;
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start();
        return oscillator;
      });
      master.gain.setTargetAtTime(.11, context.currentTime, 1.2);
      audioRef.current = { context, master, oscillators };
      setSoundOn(true);
    } catch {
      setSoundOn(false);
    }
  }

  return <main className={"pc-intro-screen" + (isIntro ? " is-intro" : " is-loading")} aria-live="polite">
    <div className="pc-intro-grain" aria-hidden="true" />
    <div className="pc-intro-orbit orbit-a" aria-hidden="true" />
    <div className="pc-intro-orbit orbit-b" aria-hidden="true" />
    <div className="pc-intro-particles" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
    <div className="pc-intro-content">
      <div className="pc-intro-mark">
        <span className="pc-intro-ring ring-one" />
        <span className="pc-intro-ring ring-two" />
        <img src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach" />
      </div>
      <span className="pc-intro-kicker">A MORE THOUGHTFUL WAY TO PRACTISE</span>
      <h1>{isIntro ? <>Find your<br/><em>flow.</em></> : <>Your music,<br/><em>in motion.</em></>}</h1>
      <p className="pc-intro-status">{isIntro ? "A little space to get in tune." : MESSAGES[messageIndex]}</p>
      <div className="pc-intro-progress"><span /></div>
      <div className="pc-intro-bottom">
        <span>PIANO COACH <i>·</i> YOUR MUSICAL JOURNEY</span>
        <button type="button" className={"pc-intro-sound" + (soundOn ? " active" : "")} onClick={toggleSound} aria-pressed={soundOn}>
          <span className="pc-sound-bars" aria-hidden="true"><i/><i/><i/><i/></span>
          {soundOn ? "Sound on" : "Enable sound"}
        </button>
      </div>
      {isIntro && <button className="pc-intro-skip" type="button" onClick={() => onComplete?.()}>Skip intro <span>↗</span></button>}
    </div>
    <div className="pc-intro-side-note" aria-hidden="true">LISTEN / LEARN / PLAY</div>
  </main>;
}
