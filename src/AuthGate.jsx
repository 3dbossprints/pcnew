import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, signOut,
} from "firebase/auth";
import { auth, googleProvider, firebaseConfigured } from "./lib/firebase.js";
import LandingPage from "./LandingPage.jsx";

function passwordIsValid(value) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("resetToken") || "");
  const [verifyToken, setVerifyToken] = useState(() => new URLSearchParams(window.location.search).get("verifyToken") || "");
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).has("resetToken") ? "forgot" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetRequested, setResetRequested] = useState(() => new URLSearchParams(window.location.search).has("resetToken"));
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

  useEffect(() => {
    if (checking || !verifyToken) return;
    let active = true;
    async function verifyLink() {
      try {
        const response = await fetch("/api/auth/verify-email-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: verifyToken }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "This verification link could not be used.");
        if (auth.currentUser) {
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
          if (active) setUser(auth.currentUser);
        }
        if (active) setMessage("Your email is verified. You can now continue to Piano Coach.");
        window.history.replaceState({}, "", window.location.pathname);
        if (active) setVerifyToken("");
      } catch (error) {
        if (active) setMessage(error.message || "This verification link could not be used.");
      }
    }
    verifyLink();
    return () => { active = false; };
  }, [checking, verifyToken]);

  if (!firebaseConfigured) return <main className="auth-screen"><section className="auth-card"><img className="auth-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><p className="eyebrow">PIANO COACH SETUP</p><h1>One last connection.</h1><p>Firebase sign-in is ready in the project, but its public web configuration still needs to be added to the Vercel environment.</p><p className="auth-help">No passwords or secret keys belong in the website code. Add the VITE_FIREBASE settings in Vercel to enable sign-in.</p></section></main>;
  if (checking) return <main className="auth-screen"><section className="auth-card"><img className="auth-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><p>Preparing your musical space…</p></section></main>;

  if (user && !user.emailVerified) return <main className="auth-screen"><section className="auth-card">
    <img className="auth-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><p className="eyebrow">CHECK YOUR INBOX</p><h1>Verify your email.</h1>
    <p>We sent a verification link and a six-digit code to <strong>{user.email}</strong>. Both expire after five minutes.</p>
    {message && <p className="auth-message" role="alert">{message}</p>}
    <form className="auth-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/auth/verify-email-code", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ code: verificationCode }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "We couldn\u0027t verify that code.");
        await user.reload(); await auth.currentUser.getIdToken(true); setUser(auth.currentUser); setMessage("Email verified. Welcome to Piano Coach.");
      } catch (error) { setMessage(error.message || "We couldn\u0027t verify that code."); } finally { setBusy(false); }
    }}>
      <label className="field"><span>Six-digit verification code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={verificationCode} onChange={e => setVerificationCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} required /></label>
      <button className="button primary auth-wide" disabled={busy || verificationCode.length !== 6}>{busy ? "Checking code…" : "Verify email"}</button>
    </form>
    <button className="button outline auth-wide" onClick={async () => {
      setBusy(true); setMessage("");
      try {
        const current = auth.currentUser; const token = await current.getIdToken();
        const response = await fetch("/api/auth/email-code", { method: "POST", headers: { Authorization: "Bearer " + token } });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "We couldn\u0027t send a code.");
        setMessage("A fresh verification link and code have been sent.");
      } catch (error) { setMessage(error.message || "We couldn\u0027t resend the email."); } finally { setBusy(false); }
    }} disabled={busy}>Resend link and code</button>
    <button className="auth-text-button" onClick={() => signOut(auth)}>Sign out</button>
  </section></main>;

  if (user?.emailVerified) return <>{message && <div className="auth-inline-warning">{message}</div>}{children}</>;

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      if (mode === "forgot") {
        if (!resetRequested) {
          const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "We could not process that request.");
          setResetRequested(true);
          setMessage(body.message || "If an account exists for that email, a reset link and code will be sent shortly.");
        } else {
          if (!passwordIsValid(newPassword)) throw new Error("Use at least 8 characters, including uppercase, lowercase and a number.");
          const payload = resetToken ? { token: resetToken, password: newPassword } : { email: email.trim(), code: resetCode, password: newPassword };
          const response = await fetch("/api/auth/password-reset-confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "We could not reset your password.");
          setMode("signin"); setResetRequested(false); setResetCode(""); setNewPassword(""); setPassword(""); setResetToken("");
          window.history.replaceState({}, "", window.location.pathname);
          setMessage(body.message || "Your password has been updated. Sign in with your new password.");
        }
        return;
      }
      if (mode === "signup") {
        if (!passwordIsValid(password)) throw new Error("Use at least 8 characters, including an uppercase letter, a lowercase letter and a number.");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const token = await credential.user.getIdToken();
        const codeResponse = await fetch("/api/auth/email-code", { method: "POST", headers: { Authorization: "Bearer " + token } });
        const codeBody = await codeResponse.json();
        if (!codeResponse.ok) setMessage(codeBody.error || "We could not send the verification link and code. Use Resend link and code.");
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

  const hasResetToken = new URLSearchParams(window.location.search).has("resetToken");
  if (!hasResetToken && mode === "signin") return <LandingPage />;

  return <main className="auth-screen"><section className="auth-card">
    <img className="auth-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><p className="eyebrow">YOUR MUSICAL JOURNEY</p>
    <h1>{mode === "signup" ? "A lovely place to begin." : mode === "forgot" ? "Reset your password." : "Welcome back."}</h1>
    <p>{mode === "signup" ? "Create your account and start making music." : mode === "forgot" ? resetToken ? "Choose a new password to finish resetting your account." : resetRequested ? "Enter the six-digit code from your email and choose a new password." : "We will email you a secure reset link and a six-digit code." : "Sign in to continue your progress."}</p>
    <form onSubmit={submit} className="auth-form">
      {!(mode === "forgot" && resetToken) && <label className="field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required disabled={mode === "forgot" && resetRequested}/></label>}
      {mode === "forgot" && resetRequested ? <>{!resetToken && <label className="field"><span>Six-digit reset code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={resetCode} onChange={e=>setResetCode(e.target.value.replace(/[^0-9]/g,"").slice(0,6))} required/></label>}<label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><small className="auth-help">At least 8 characters, with uppercase, lowercase and a number.</small></> : mode !== "forgot" ? <><label className="field"><span>Password</span><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} required/></label>{mode === "signup" && <small className="auth-help">At least 8 characters, with uppercase, lowercase and a number.</small>}</> : null}
      {message && <p className="auth-message" role="alert">{message}</p>}
      <button className="button primary auth-wide" disabled={busy || (mode === "forgot" && resetRequested && ((!resetToken && resetCode.length !== 6) || !newPassword))}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? resetRequested ? "Set new password" : "Send reset email" : "Sign in"}</button>
    </form>
    {mode === "signin" && <button className="auth-text-button" onClick={()=>{setMode("forgot");setResetRequested(false);setMessage("");}}>Forgot password?</button>}
    {mode !== "forgot" && <><div className="auth-separator"><span>or</span></div><button className="button outline auth-wide" disabled={busy} onClick={async()=>{setBusy(true);setMessage("");try{await signInWithPopup(auth,googleProvider);}catch(error){setMessage(error.message);}finally{setBusy(false);}}}>Continue with Google</button></>}
    <p className="auth-switch">{mode === "signup" ? "Already have an account?" : mode === "forgot" ? "Remembered your password?" : "New to Piano Coach?"} <button className="auth-text-button" onClick={()=>{setMode(mode==="signup"?"signin":"signin");setResetRequested(false);setMessage("");}}> {mode === "signup" ? "Sign in" : mode === "forgot" ? "Back to sign in" : "Create an account"}</button>{mode === "signin" && <> · <button className="auth-text-button" onClick={()=>{setMode("signup");setMessage("");}}>Create an account</button></>}</p>
  </section></main>;
}
