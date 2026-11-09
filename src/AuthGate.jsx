import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification,
  signInWithEmailAndPassword, signInWithPopup, signOut,
} from "firebase/auth";
import { auth, googleProvider, firebaseConfigured } from "./lib/firebase.js";

function passwordIsValid(value) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) { setChecking(false); return undefined; }
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setChecking(false);
      if (nextUser?.emailVerified) {
        try {
          const token = await nextUser.getIdToken();
          const response = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            setMessage(body.error || "Your account could not be loaded yet.");
          }
        } catch {
          setMessage("We couldn't connect to your account. Please check your connection and try again.");
        }
      }
    });
  }, []);

  if (!firebaseConfigured) return <main className="auth-screen"><section className="auth-card"><div className="auth-mark">𝄞</div><p className="eyebrow">PIANO COACH SETUP</p><h1>One last connection.</h1><p>Firebase sign-in is ready in the project, but its public web configuration still needs to be added to the Vercel environment.</p><p className="auth-help">No passwords or secret keys belong in the website code. Add the VITE_FIREBASE settings in Vercel to enable sign-in.</p></section></main>;
  if (checking) return <main className="auth-screen"><section className="auth-card"><div className="auth-mark">𝄞</div><p>Preparing your musical space…</p></section></main>;

  if (user && !user.emailVerified) return <main className="auth-screen"><section className="auth-card"><div className="auth-mark">𝄞</div><p className="eyebrow">CHECK YOUR INBOX</p><h1>Verify your email.</h1><p>We've sent a verification link to <strong>{user.email}</strong>. Verify it, then return here.</p>{message && <p className="auth-message">{message}</p>}<button className="button primary auth-wide" onClick={async () => { setBusy(true); setMessage(""); try { await user.reload(); const refreshed = auth.currentUser; if (refreshed?.emailVerified) { setUser(refreshed); } else { await sendEmailVerification(refreshed); setMessage("A fresh verification email has been sent."); } } catch { setMessage("We couldn't resend the email just now."); } finally { setBusy(false); } }} disabled={busy}>Resend verification email</button><button className="auth-text-button" onClick={() => signOut(auth)}>Sign out</button></section></main>;

  if (user?.emailVerified) return <>{message && <div className="auth-inline-warning">{message}</div>}{children}</>;

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      if (mode === "signup") {
        if (!passwordIsValid(password)) throw new Error("Use at least 8 characters, including an uppercase letter, a lowercase letter and a number.");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(credential.user);
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
    } finally { setBusy(false); }
  }

  return <main className="auth-screen"><section className="auth-card">
    <div className="auth-mark">𝄞</div><p className="eyebrow">YOUR MUSICAL JOURNEY</p>
    <h1>{mode === "signup" ? "A lovely place to begin." : "Welcome back."}</h1>
    <p>{mode === "signup" ? "Create your account and start making music." : "Sign in to continue your progress."}</p>
    <form onSubmit={submit} className="auth-form">
      <label className="field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
      <label className="field"><span>Password</span><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} required /></label>
      {mode === "signup" && <small className="auth-help">At least 8 characters, with uppercase, lowercase and a number.</small>}
      {message && <p className="auth-message" role="alert">{message}</p>}
      <button className="button primary auth-wide" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
    </form>
    <div className="auth-separator"><span>or</span></div>
    <button className="button outline auth-wide" disabled={busy} onClick={async()=>{setBusy(true);setMessage("");try{await signInWithPopup(auth,googleProvider);}catch(error){setMessage(error.message);}finally{setBusy(false);}}}>Continue with Google</button>
    <p className="auth-switch">{mode === "signup" ? "Already have an account?" : "New to Piano Coach?"} <button className="auth-text-button" onClick={()=>{setMode(mode==="signup"?"signin":"signup");setMessage("");}}> {mode === "signup" ? "Sign in" : "Create an account"}</button></p>
  </section></main>;
}
