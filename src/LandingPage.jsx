import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase.js";
import LandingScene from "./LandingScene.jsx";
import "./landing-depth.css";

const PLANS = [
  {
    id: "free",
    name: "Free Demo",
    price: "£0",
    period: "lifetime",
    blurb: "Try assisted practice with a 60-minute lifetime allowance.",
    features: ["60 min lifetime practice", "Assisted Practice mode", "Standard Practice mode", "1 score in your library", "Basic mistake feedback"],
    cta: "Start free",
    highlight: false,
  },
  {
    id: "basic",
    name: "Basic",
    price: "£9.99",
    period: "per month",
    blurb: "Everything you need for structured, daily practice.",
    features: ["Unlimited practice time", "Assisted + Standard Practice", "Grade Plan tracking", "Mistake feedback & scoring", "Practice streaks", "Full score library"],
    cta: "Choose Basic",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "£19.99",
    period: "per month",
    blurb: "Complete preparation with every tool included.",
    features: ["Everything in Basic", "Full Grade Plan with pieces", "Scale & arpeggio library", "Section-level progress tracking", "Exam book upload & reference", "Priority email support"],
    cta: "Choose Pro",
    highlight: true,
  },
];

const FEATURES = [
  { icon: "♪", title: "Assisted Practice", desc: "Real-time note detection shows you exactly where to focus, with instant visual feedback as you play." },
  { icon: "♫", title: "Standard Practice", desc: "Free-form sessions with a stopwatch, metronome and your own scores. Perfect for rehearsing repertoire." },
  { icon: "◎", title: "Grade Plan", desc: "Organise pieces, exercises and scales by section. Track your progress through every part of your syllabus." },
  { icon: "✦", title: "Mistake Feedback", desc: "After each session, see which bars and notes need attention with a clear, encouraging breakdown." },
  { icon: "◷", title: "Practice Streaks", desc: "Build a daily habit. Your dashboard shows your streak, weekly time and progress toward your 15-minute goal." },
  { icon: "♬", title: "Scale Library", desc: "A searchable library of scales and arpeggios with fingering guidance, aligned to your exam board." },
];

const STEPS = [
  { num: "01", title: "Set your grade", desc: "Choose your exam board and grade. Piano Coach tailors everything to your syllabus." },
  { num: "02", title: "Add your music", desc: "Upload MusicXML scores, PDFs and exam books. Build a library that follows you everywhere." },
  { num: "03", title: "Practise with feedback", desc: "Play along with real-time note tracking. Get instant feedback on timing and accuracy." },
  { num: "04", title: "Track your progress", desc: "Watch your streaks grow, your scores improve and your Grade Plan come together." },
];

const STAFF_LINES = [22, 30, 38, 46, 54];
const STAFF_NOTES = [
  { x: 78, y: 50 }, { x: 120, y: 45 }, { x: 162, y: 40 },
  { x: 204, y: 35 }, { x: 246, y: 40 }, { x: 288, y: 45 },
];
const MISTAKES = [
  { bar: 4, x: 60, noteIndex: 1, note: "E♭ played as E natural" },
  { bar: 9, x: 146, noteIndex: 3, note: "Left hand rushed the offbeat" },
  { bar: 14, x: 232, noteIndex: 5, note: "G♯ released too early" },
];

function StaffPreview({ highlightX = null, missedIndex = null }) {
  return (
    <svg className="lp-staff" viewBox="0 0 330 80" aria-hidden="true">
      {highlightX !== null && <rect x={highlightX} y="6" width="84" height="68" rx="10" className="lp-staff-highlight" />}
      {STAFF_LINES.map((y) => <line key={y} x1="14" x2="318" y1={y} y2={y} className="lp-staff-line" />)}
      <text x="16" y="60" className="lp-staff-clef">𝄞</text>
      {STAFF_NOTES.map((note, i) => (
        <g key={i} className={i === missedIndex ? "lp-staff-note is-miss" : "lp-staff-note"}>
          <line x1={note.x + 5} x2={note.x + 5} y1={note.y} y2={note.y - 24} />
          <ellipse cx={note.x} cy={note.y} rx="5.5" ry="4" transform={"rotate(-20 " + note.x + " " + note.y + ")"} />
        </g>
      ))}
    </svg>
  );
}

function FeedbackPreview() {
  const [active, setActive] = useState(0);
  const mistake = MISTAKES[active];
  return (
    <div className="lp-feedback">
      <div className="lp-feedback-head">
        <div><small>SESSION SCORE</small><strong>86%</strong></div>
        <div className="lp-feedback-nav">
          <button type="button" aria-label="Previous mistake" onClick={() => setActive((i) => Math.max(0, i - 1))} disabled={active === 0}>‹</button>
          <span>{active + 1} / {MISTAKES.length}</span>
          <button type="button" aria-label="Next mistake" onClick={() => setActive((i) => Math.min(MISTAKES.length - 1, i + 1))} disabled={active === MISTAKES.length - 1}>›</button>
        </div>
      </div>
      <StaffPreview highlightX={mistake.x} missedIndex={mistake.noteIndex} />
      <ul>
        {MISTAKES.map((item, i) => (
          <li key={item.bar}>
            <button type="button" className={i === active ? "active" : ""} onClick={() => setActive(i)}>
              <b>Bar {item.bar}</b><span>{item.note}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function passwordIsValid(value) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("lp-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function useParallax() {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const progress = Math.max(-1, Math.min(1, rect.top / window.innerHeight));
        ref.current.style.setProperty("--lp-parallax", String(progress));
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

function usePointerDepth() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(hover: none)").matches) return;
    let raf = 0;
    function onMove(event) {
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        node.style.setProperty("--lp-tx", x.toFixed(3));
        node.style.setProperty("--lp-ty", y.toFixed(3));
      });
    }
    function onLeave() {
      cancelAnimationFrame(raf);
      node.style.setProperty("--lp-tx", "0");
      node.style.setProperty("--lp-ty", "0");
    }
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return ref;
}

export default function LandingPage({ onAuthed }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const heroRef = useParallax();
  const visualRef = usePointerDepth();
  const [navScrolled, setNavScrolled] = useState(false);

  useScrollReveal();

  useEffect(() => {
    function onScroll() { setNavScrolled(window.scrollY > 20); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        if (!passwordIsValid(password)) throw new Error("Use at least 8 characters, including uppercase, lowercase and a number.");
        const cleanName = name.trim();
        if (!cleanName || cleanName.length > 100) throw new Error("Enter your name (up to 100 characters).");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: cleanName });
        const token = await credential.user.getIdToken(true);
        await fetch("/api/auth/email-code", { method: "POST", headers: { Authorization: "Bearer " + token } });
        setMessage("Check your inbox for a verification link and code.");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      const messages = {
        "auth/email-already-in-use": "An account already exists for this email. Try signing in.",
        "auth/invalid-credential": "That email and password combination wasn't recognised.",
        "auth/weak-password": "Choose a stronger password with at least 8 characters.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/too-many-requests": "Too many attempts. Please wait a little before trying again.",
      };
      setMessage(messages[error.code] || error.message || "We couldn't complete that request.");
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setBusy(true);
    setMessage("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setMessage(error.message || "Google sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function openAuth(authMode) {
    setMode(authMode);
    setMessage("");
    setOverlayOpen(true);
  }

  function pickPlan(planId) {
    openAuth("signup");
  }

  return (
    <div className="lp-shell">
      <nav className={"lp-nav" + (navScrolled ? " scrolled" : "")}>
        <div className="lp-nav-brand">
          <img className="lp-brand-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach" />
        </div>
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="lp-nav-actions">
          <button className="lp-nav-signin" onClick={() => openAuth("signin")}>Sign in</button>
          <button className="lp-nav-cta" onClick={() => openAuth("signup")}>Start free</button>
        </div>
      </nav>

      <section className="lp-hero" ref={heroRef}>
        <div className="lp-hero-copy lp-reveal">
          <span className="lp-eyebrow">YOUR MUSICAL JOURNEY</span>
          <h1>Practice piano<br/>with a coach<br/><em>who listens.</em></h1>
          <p>Real-time feedback, grade-aware practice plans and a library that follows you. Piano Coach turns every session into progress.</p>
          <div className="lp-hero-actions">
            <button className="lp-button-primary" onClick={() => openAuth("signup")}>Start your free demo <span>↗</span></button>
            <a className="lp-button-ghost" href="#pricing">See plans</a>
          </div>
          <div className="lp-hero-meta">
            <span><strong>60 min</strong> free lifetime practice</span>
            <span><strong>No card</strong> needed to start</span>
          </div>
        </div>
        <div ref={visualRef} className="lp-hero-visual lp-reveal lp-reveal-delay-1">
          <LandingScene />
          <div className="lp-orbit orbit-one" aria-hidden="true" />
          <div className="lp-orbit orbit-two" aria-hidden="true" />
          <div className="lp-hero-note note-a" aria-hidden="true">♪</div>
          <div className="lp-hero-note note-b" aria-hidden="true">♫</div>
          <div className="lp-stage">
            <div className="lp-stage-floor" aria-hidden="true" />
            <div className="lp-device">
              <div className="lp-device-bar"><span>Assisted Practice · Bar 4</span><span className="lp-live"><i />Listening</span></div>
              <StaffPreview highlightX={146} missedIndex={3} />
              <div className="lp-device-footer">
                <div><small>Current section</small><strong>Bars 1–8</strong></div>
                <div className="lp-score-ring" style={{ "--p": "92%" }}><div><strong>92</strong><small>%</small></div></div>
              </div>
            </div>
          </div>
          <div className="lp-hero-floating-card lp-float-card-1">
            <span className="lp-float-icon">♪</span>
            <div><strong>Assisted Practice</strong><small>Real-time note detection</small></div>
          </div>
          <div className="lp-hero-floating-card lp-float-card-2">
            <span className="lp-float-icon">◎</span>
            <div><strong>Grade Plan</strong><small>Track your syllabus</small></div>
          </div>
          <div className="lp-hero-chip lp-chip-score" aria-hidden="true"><span>+12</span><small>bars improved</small></div>
        </div>
      </section>

      <section className="lp-trust-strip lp-reveal">
        <div className="lp-trust-inner">
          <span>ABRSM</span>
          <span>Trinity College London</span>
          <span>RSL Awards</span>
          <span>LCME</span>
          <span>MTB</span>
          <span>VCM</span>
          <span>NCM</span>
        </div>
      </section>

      <div className="lp-marquee" aria-label="Piano Coach capabilities">
        <div className="lp-marquee-track"><span>LISTEN DEEPLY</span><i>✦</i><span>PRACTISE INTENTIONALLY</span><i>✦</i><span>PLAY WITH CONFIDENCE</span><i>✦</i><span>LISTEN DEEPLY</span><i>✦</i><span>PRACTISE INTENTIONALLY</span><i>✦</i><span>PLAY WITH CONFIDENCE</span><i>✦</i></div>
      </div>

      <section className="lp-features" id="features">
        <div className="lp-section-head lp-reveal">
          <span className="lp-eyebrow">EVERYTHING YOU NEED</span>
          <h2>Built for serious piano students.</h2>
          <p>From your first scale to your grade exam, Piano Coach guides every minute of practice.</p>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((feature, i) => (
            <div className={"lp-feature-card lp-reveal" + (i > 0 ? " lp-reveal-delay-" + Math.min(i % 3, 3) : "")} key={feature.title}>
              <span className="lp-feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-showcase lp-showcase-first lp-reveal">
        <div className="lp-showcase-grid">
          <div className="lp-showcase-image-col">
            <div className="lp-tilt-card">
              <span className="lp-card-label">Assisted Practice · Bar 6 detected</span>
              <StaffPreview highlightX={204} />
              <StaffPreview />
            </div>
          </div>
          <div className="lp-showcase-text">
            <span className="lp-eyebrow">ASSISTED PRACTICE</span>
            <h2>Falling notes.<br/>Real-time feedback.</h2>
            <p>A piano keyboard appears automatically, sized to the required octaves. Falling notes show the correct notes in the correct order. The AI listens and checks whether you play them right — quietly, without interrupting.</p>
            <ul className="lp-showcase-list">
              <li><span>✓</span>Microphone or MIDI input</li>
              <li><span>✓</span>Play 2 bars to preview the next passage</li>
              <li><span>✓</span>Single-line score with current bar highlighted</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-showcase lp-showcase-alt lp-reveal">
        <div className="lp-showcase-grid lp-showcase-reverse">
          <div className="lp-showcase-image-col">
            <FeedbackPreview />
          </div>
          <div className="lp-showcase-text">
            <span className="lp-eyebrow">MISTAKE FEEDBACK</span>
            <h2>Know exactly where<br/>to focus next.</h2>
            <p>After each session, see which bars and notes need attention. Listen to recordings of the passages where mistakes happened. Orange highlights on your score show every trouble spot, with arrows to navigate between them.</p>
            <ul className="lp-showcase-list">
              <li><span>✓</span>Bar-level mistake highlights</li>
              <li><span>✓</span>Audio clips of each mistake</li>
              <li><span>✓</span>Left/right arrows to navigate</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-how" id="how">
        <div className="lp-section-head lp-reveal">
          <span className="lp-eyebrow">HOW IT WORKS</span>
          <h2>From sign-up to standing ovation.</h2>
        </div>
        <div className="lp-steps-grid">
          {STEPS.map((step, i) => (
            <div className={"lp-step-card lp-reveal" + (i > 0 ? " lp-reveal-delay-" + Math.min(i, 3) : "")} key={step.num}>
              <span className="lp-step-num">{step.num}</span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-pricing" id="pricing">
        <div className="lp-section-head lp-reveal">
          <span className="lp-eyebrow">SIMPLE PRICING</span>
          <h2>Choose your plan.</h2>
          <p>Start free, upgrade when you're ready. Cancel anytime.</p>
        </div>
        <div className="lp-plans-grid">
          {PLANS.map((plan, i) => (
            <div className={"lp-plan-card lp-reveal" + (plan.highlight ? " highlighted" : "") + (i > 0 ? " lp-reveal-delay-" + Math.min(i, 3) : "")} key={plan.id}>
              {plan.highlight && <span className="lp-plan-badge">Most popular</span>}
              <h3>{plan.name}</h3>
              <div className="lp-plan-price">
                <span className="lp-plan-amount">{plan.price}</span>
                <span className="lp-plan-period">{plan.period}</span>
              </div>
              <p className="lp-plan-blurb">{plan.blurb}</p>
              <ul className="lp-plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}><span>✓</span>{feature}</li>
                ))}
              </ul>
              <button
                className={plan.highlight ? "lp-button-primary" : "lp-button-outline"}
                onClick={() => pickPlan(plan.id)}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-cta-strip lp-reveal">
        <div className="lp-cta-content">
          <h2>Ready to make music?</h2>
          <p>Your first 60 minutes are on us. No card, no commitment.</p>
          <button className="lp-button-primary large" onClick={() => openAuth("signup")}>Start your free demo <span>↗</span></button>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img className="lp-footer-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach" />
          </div>
          <p>Piano Coach helps students prepare for graded piano exams with real-time feedback and structured practice plans.</p>
          <div className="lp-parent-brand"><span>Part of</span><img src="/assets/logos/music-coach-white.svg" alt="Music Coach" /></div>
          <div className="lp-footer-legal">
            <span>© {new Date().getFullYear()} Piano Coach</span>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </footer>

      {overlayOpen && (
        <div className="lp-auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOverlayOpen(false); }}>
          <div className="lp-auth-card">
            <button className="lp-auth-close" onClick={() => setOverlayOpen(false)}>×</button>
            <img className="lp-auth-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach" />
            <span className="lp-eyebrow">{mode === "signup" ? "BEGIN YOUR JOURNEY" : "WELCOME BACK"}</span>
            <h2>{mode === "signup" ? "Begin with your music." : "Sign in to Piano Coach."}</h2>
            <p>{mode === "signup" ? "Start your free 60-minute demo. No card required." : "Continue your musical progress."}</p>
            <form className="lp-auth-form" onSubmit={submit}>
              {mode === "signup" && <label className="lp-field">
                <span>Your name</span>
                <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
              </label>}
              <label className="lp-field">
                <span>Email address</span>
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="lp-field">
                <span>Password</span>
                <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {mode === "signup" && <small className="lp-auth-help">At least 8 characters, with uppercase, lowercase and a number.</small>}
              {message && <p className="lp-auth-message" role="alert">{message}</p>}
              <button className="lp-button-primary" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
            </form>
            <div className="lp-auth-separator"><span>or</span></div>
            <button className="lp-button-outline lp-google-button" disabled={busy} onClick={googleSignIn}><svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.6 2.9-2.3 5.4-4.8 7.1l7.5 5.8c4.4-4.1 7-10.1 7-17.4z"/><path fill="#FBBC05" d="M10.3 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.5 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.1-6.1l-7.5-5.8c-2.1 1.4-4.7 2.3-7.6 2.3-6.4 0-11.8-3.8-13.7-9.2l-7.8 6.1C6.5 43.2 14.6 48 24 48z"/></svg><span>Continue with Google</span></button>
            <p className="lp-auth-switch">
              {mode === "signup" ? "Already registered?" : "New to Piano Coach?"}
              <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); setName(""); }}>
                {mode === "signup" ? "Sign in" : "Create account"}
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
