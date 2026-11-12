import { useState } from "react";
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

function passwordIsValid(value) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

export default function LandingPage({ onAuthed }) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    if (planId === "free") {
      openAuth("signup");
    } else {
      openAuth("signup");
    }
  }

  return (
    <div className="lp-shell">
      <nav className="lp-nav">
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

      <section className="lp-hero">
        <div className="lp-hero-copy">
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
        <div className="lp-piano-card" aria-hidden="true">
          <div className="lp-piano-card-glow" />
          <div className="lp-orbit lp-orbit-one" />
          <div className="lp-orbit lp-orbit-two" />
          <div className="lp-piano-keys">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="lp-piano-key" style={{ animationDelay: (i * 0.3) + "s" }}>
                {i === 2 || i === 6 || i === 9 || i === 13 ? <span className="lp-piano-black" /> : null}
              </div>
            ))}
          </div>
          <div className="lp-falling-notes">
            <span style={{ animationDelay: "0s" }}>♪</span>
            <span style={{ animationDelay: "1.2s" }}>♫</span>
            <span style={{ animationDelay: "2.4s" }}>♩</span>
            <span style={{ animationDelay: "3.6s" }}>♬</span>
            <span style={{ animationDelay: "0.6s" }}>♪</span>
          </div>
        </div>
      </section>

      <section className="lp-features" id="features">
        <div className="lp-section-head">
          <span className="lp-eyebrow">EVERYTHING YOU NEED</span>
          <h2>Built for serious piano students.</h2>
          <p>From your first scale to your grade exam, Piano Coach guides every minute of practice.</p>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((feature) => (
            <div className="lp-feature-card" key={feature.title}>
              <span className="lp-feature-icon">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-how" id="how">
        <div className="lp-section-head">
          <span className="lp-eyebrow">HOW IT WORKS</span>
          <h2>From sign-up to standing ovation.</h2>
        </div>
        <div className="lp-steps-grid">
          {STEPS.map((step) => (
            <div className="lp-step-card" key={step.num}>
              <span className="lp-step-num">{step.num}</span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-pricing" id="pricing">
        <div className="lp-section-head">
          <span className="lp-eyebrow">SIMPLE PRICING</span>
          <h2>Choose your plan.</h2>
          <p>Start free, upgrade when you're ready. Cancel anytime.</p>
        </div>
        <div className="lp-plans-grid">
          {PLANS.map((plan) => (
            <div className={"lp-plan-card" + (plan.highlight ? " highlighted" : "")} key={plan.id}>
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

      <section className="lp-cta-strip">
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
