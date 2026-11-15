import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile,
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
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("resetToken")) return "forgot";
    return window.location.pathname.replace(/\\/+$/, "") === "/signup" ? "signup" : "signin";
  });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
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

  const needsProfileName = Boolean(user?.emailVerified && !user.displayName && user.providerData?.some(item => item.providerId === "password"));
  if (needsProfileName) return <main className="auth-screen"><section className="auth-card">
    <img className="auth-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><p className="eyebrow">COMPLETE YOUR PROFILE</p><h1>What should we call you?</h1>
    <p>Add your name so it appears consistently across your Piano Coach account. You only need to do this once.</p>
    <form className="auth-form" onSubmit={async event => {
      event.preventDefault(); const cleanName = name.trim();
      if (!cleanName || cleanName.length > 100) { setMessage("Enter a name between 1 and 100 characters."); return; }
      setBusy(true); setMessage("");
      try {
        await updateProfile(auth.currentUser, { displayName: cleanName });
        await auth.currentUser.reload();
        const token = await auth.currentUser.getIdToken(true);
        const response = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Your name could not be synced to your profile.");
        setUser(auth.currentUser);
      } catch (error) { setMessage(error.message || "Your name could not be saved. Please try again."); }
      finally { setBusy(false); }
    }}>
      <label className="field"><span>Your name</span><input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></label>
      {message && <p className="auth-message" role="alert">{message}</p>}
      <button className="button primary auth-wide" disabled={busy || !name.trim()}>{busy ? "Saving your name…" : "Continue"}</button>
    </form>
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
        const cleanName = name.trim();
        if (!cleanName || cleanName.length > 100) throw new Error("Enter your name (up to 100 characters).");
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: cleanName });
        const token = await credential.user.getIdToken(true);
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
  const authRoute = ["/signin", "/signup"].includes(window.location.pathname.replace(/\\/+$/, ""));
  if (!hasResetToken && !authRoute) return <LandingPage />;

  return <main className="auth-screen"><section className="auth-card">
    <img className="auth-logo" src="/assets/logos/piano-coach-sage.svg" alt="Piano Coach"/><p className="eyebrow">YOUR MUSICAL JOURNEY</p>
    <h1>{mode === "signup" ? "A lovely place to begin." : mode === "forgot" ? "Reset your password." : "Welcome back."}</h1>
    <p>{mode === "signup" ? "Create your account and start making music." : mode === "forgot" ? resetToken ? "Choose a new password to finish resetting your account." : resetRequested ? "Enter the six-digit code from your email and choose a new password." : "We will email you a secure reset link and a six-digit code." : "Sign in to continue your progress."}</p>
    <form onSubmit={submit} className="auth-form">
      {mode === "signup" && <label className="field"><span>Your name</span><input type="text" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={100} required/></label>}
      {!(mode === "forgot" && resetToken) && <label className="field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required disabled={mode === "forgot" && resetRequested}/></label>}
      {mode === "forgot" && resetRequested ? <>{!resetToken && <label className="field"><span>Six-digit reset code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={resetCode} onChange={e=>setResetCode(e.target.value.replace(/[^0-9]/g,"").slice(0,6))} required/></label>}<label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></label><small className="auth-help">At least 8 characters, with uppercase, lowercase and a number.</small></> : mode !== "forgot" ? <><label className="field"><span>Password</span><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} required/></label>{mode === "signup" && <small className="auth-help">At least 8 characters, with uppercase, lowercase and a number.</small>}</> : null}
      {message && <p className="auth-message" role="alert">{message}</p>}
      <button className="button primary auth-wide" disabled={busy || (mode === "forgot" && resetRequested && ((!resetToken && resetCode.length !== 6) || !newPassword))}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? resetRequested ? "Set new password" : "Send reset email" : "Sign in"}</button>
    </form>
    {mode === "signin" && <button className="auth-text-button" onClick={()=>{setMode("forgot");setResetRequested(false);setMessage("");}}>Forgot password?</button>}
    {mode !== "forgot" && <><div className="auth-separator"><span>or</span></div><button className="button outline auth-wide" disabled={busy} onClick={async()=>{setBusy(true);setMessage("");try{await signInWithPopup(auth,googleProvider);}catch(error){setMessage(error.message);}finally{setBusy(false);}}}><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.6 2.9-2.3 5.4-4.8 7.1l7.5 5.8c4.4-4.1 7-10.1 7-17.4z"/><path fill="#FBBC05" d="M10.3 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.5 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.1-6.1l-7.5-5.8c-2.1 1.4-4.7 2.3-7.6 2.3-6.4 0-11.8-3.8-13.7-9.2l-7.8 6.1C6.5 43.2 14.6 48 24 48z"/></svg><span>Continue with Google</span></button></>}
    <p className="auth-switch">{mode === "signup" ? "Already have an account?" : mode === "forgot" ? "Remembered your password?" : "New to Piano Coach?"} <button className="auth-text-button" onClick={()=>{setMode("signin");setResetRequested(false);setMessage("");setName("");}}> {mode === "signup" ? "Sign in" : mode === "forgot" ? "Back to sign in" : "Create an account"}</button></p>
  </section></main>;
}
