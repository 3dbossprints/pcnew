import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export function adminAuth() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("Firebase Admin is not configured.");
    let serviceAccount;
    try { serviceAccount = JSON.parse(raw); }
    catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON."); }
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth();
}
export async function requireUser(req, res) {
  const match = (req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) { res.status(401).json({ error: "Sign in to continue." }); return null; }
  try {
    const token = await adminAuth().verifyIdToken(match[1], true);
    return { uid: token.uid, email: token.email || null, emailVerified: Boolean(token.email_verified), name: token.name || null };
  } catch {
    res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
    return null;
  }
}
