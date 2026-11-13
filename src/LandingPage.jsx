import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase.js";

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

const PIANO_HERO = "https://images.pexels.com/photos/13217040/pexels-photo-13217040.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";
const PIANO_STRINGS = "https://images.pexels.com/photos/11662076/pexels-photo-11662076.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";
const PIANO_HANDS = "https://images.pexels.com/photos/32921115/pexels-photo-32921115.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";
const PIANO_KEYS_CLOSE = "https://images.pexels.com/photos/33122736/pexels-photo-33122736.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";
const SHEET_MUSIC = "https://images.pexels.com/photos/210764/pexels-photo-210764.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";
const PIANO_DIGITAL = "https://images.pexels.com/photos/28708838/pexels-photo-28708838.jpeg?auto=compress&cs=tinysrgb&h=650&w=940";

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

export default function LandingPage({ onAuthed }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const heroRef = useParallax();
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
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const token = await credential.user.getIdToken();
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
          <span className="lp-nav-mark">𝄞</span>
          <strong>Piano <em>Coach</em></strong>
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
        <div className="lp-hero-visual lp-reveal lp-reveal-delay-1">
          <div className="lp-hero-image-wrap">
            <img src={PIANO_HERO} alt="Close-up of piano keys" className="lp-hero-image" loading="eager" />
            <div className="lp-hero-image-glow" />
          </div>
          <div className="lp-hero-floating-card lp-float-card-1">
            <span className="lp-float-icon">♪</span>
            <div><strong>Assisted Practice</strong><small>Real-time note detection</small></div>
          </div>
          <div className="lp-hero-floating-card lp-float-card-2">
            <span className="lp-float-icon">◎</span>
            <div><strong>Grade Plan</strong><small>Track your syllabus</small></div>
          </div>
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

      <section className="lp-showcase lp-reveal">
        <div className="lp-showcase-grid">
          <div className="lp-showcase-image-col">
            <img src={PIANO_HANDS} alt="Pianist's hands playing piano" className="lp-showcase-image" loading="lazy" />
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
            <img src={SHEET_MUSIC} alt="Sheet music on a piano" className="lp-showcase-image" loading="lazy" />
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
            <span className="lp-nav-mark">𝄞</span>
            <strong>Piano <em>Coach</em></strong>
          </div>
          <p>Piano Coach helps students prepare for graded piano exams with real-time feedback and structured practice plans.</p>
          <div className="lp-footer-legal">
            <span>© {new Date().getFullYear()} Piano Coach</span>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
        </div>
      </footer>

      {overlayOpen && (
        <div className="lp-auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOverlayOpen(false); }}>
          <div className="lp-auth-card">
            <button className="lp-auth-close" onClick={() => setOverlayOpen(false)}>×</button>
            <div className="lp-auth-mark">𝄞</div>
            <span className="lp-eyebrow">{mode === "signup" ? "BEGIN YOUR JOURNEY" : "WELCOME BACK"}</span>
            <h2>{mode === "signup" ? "Create your account." : "Sign in to Piano Coach."}</h2>
            <p>{mode === "signup" ? "Start your free 60-minute demo. No card required." : "Continue your musical progress."}</p>
            <form className="lp-auth-form" onSubmit={submit}>
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
            <button className="lp-button-outline" disabled={busy} onClick={googleSignIn}>Continue with Google</button>
            <p className="lp-auth-switch">
              {mode === "signup" ? "Already have an account?" : "New to Piano Coach?"}
              <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage(""); }}>
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
