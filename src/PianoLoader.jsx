import { useEffect, useState } from "react";

const MESSAGES = [
  "Tuning your musical space",
  "Preparing your next session",
  "Bringing your progress together",
];

export default function PianoLoader({ variant = "loading", onComplete }) {
  const [messageIndex, setMessageIndex] = useState(0);
  const isIntro = variant === "intro";

  useEffect(() => {
    if (!isIntro) {
      const timer = window.setInterval(() => setMessageIndex(index => (index + 1) % MESSAGES.length), 1900);
      return () => window.clearInterval(timer);
    }
    const timer = window.setTimeout(() => onComplete?.(), 4200);
    return () => window.clearTimeout(timer);
  }, [isIntro, onComplete]);

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
      <div className="pc-intro-score" aria-hidden="true">
        <svg viewBox="0 0 360 76">
          <path d="M8 18H352 M8 28H352 M8 38H352 M8 48H352 M8 58H352"/>
          <text x="12" y="57">𝄞</text>
          <g className="pc-intro-note" transform="translate(92 47)"><ellipse rx="6" ry="4"/><path d="M6 0V-27"/></g>
          <g className="pc-intro-note" transform="translate(132 32)"><ellipse rx="6" ry="4"/><path d="M6 0V-27"/></g>
          <g className="pc-intro-note" transform="translate(172 42)"><ellipse rx="6" ry="4"/><path d="M6 0V-27"/></g>
          <g className="pc-intro-note" transform="translate(212 22)"><ellipse rx="6" ry="4"/><path d="M6 0V-27"/></g>
          <g className="pc-intro-note" transform="translate(252 37)"><ellipse rx="6" ry="4"/><path d="M6 0V-27"/></g>
          <g className="pc-intro-note" transform="translate(292 27)"><ellipse rx="6" ry="4"/><path d="M6 0V-27"/></g>
        </svg>
      </div>
      <span className="pc-intro-kicker">A MORE THOUGHTFUL WAY TO PRACTISE</span>
      <h1>{isIntro ? <>Find your<br/><em>flow.</em></> : <>Your music,<br/><em>in motion.</em></>}</h1>
      <p className="pc-intro-status">{isIntro ? "A little space to get in tune." : MESSAGES[messageIndex]}</p>
      <div className="pc-intro-progress"><span /></div>
      <div className="pc-intro-bottom">
        <span>PIANO COACH <i>·</i> YOUR MUSICAL JOURNEY</span>
        <span className="pc-intro-sound-label">A MOMENT TO GET IN TUNE</span>
      </div>
      {isIntro && <button className="pc-intro-skip" type="button" onClick={() => onComplete?.()}>Skip intro <span>↗</span></button>}
    </div>
    <div className="pc-intro-side-note" aria-hidden="true">LISTEN / LEARN / PLAY</div>
  </main>;
}
