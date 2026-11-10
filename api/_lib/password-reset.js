import { createHash, randomBytes, randomInt } from "node:crypto";
import { adminAuth } from "./auth.js";
import { database } from "./db.js";
import { sendEmail } from "./email.js";
import { requireMethod, sendJson } from "./http.js";
const digest = value => createHash("sha256").update(value).digest("hex");
const appBaseUrl = () => (process.env.PUBLIC_APP_URL || (process.env.VERCEL_ENV === "production" ? "https://pianocoach.cc.cd" : process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://pianocoach.cc.cd")).replace(/\/+$/, "");
const generic = { message: "If an account exists for that email, a reset link and code will be sent shortly." };
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sendJson(res, 200, generic);
  try {
    let account;
    try { account = await adminAuth().getUserByEmail(email); }
    catch (error) { if (error.code === "auth/user-not-found") return sendJson(res, 200, generic); throw error; }
    const db = database();
    const previous = await db.query("SELECT requested_at,hour_requests,hour_window_started_at FROM password_reset_codes WHERE firebase_uid=$1", [account.uid]);
    if (previous.rowCount) {
      const row = previous.rows[0];
      if (Date.now() - new Date(row.requested_at).getTime() < 60_000) return sendJson(res, 200, generic);
      if (Date.now() - new Date(row.hour_window_started_at).getTime() < 60 * 60 * 1000 && Number(row.hour_requests) >= 5) return sendJson(res, 200, generic);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const linkToken = randomBytes(32).toString("base64url");
    const link = appBaseUrl() + "/?resetToken=" + encodeURIComponent(linkToken);
    await db.query(
      "INSERT INTO password_reset_codes(firebase_uid,email,code_hash,link_token_hash,expires_at,requested_at,attempts,hour_requests,hour_window_started_at,created_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '5 minutes',NOW(),0,1,NOW(),NOW()) " +
      "ON CONFLICT(firebase_uid) DO UPDATE SET email=EXCLUDED.email,code_hash=EXCLUDED.code_hash,link_token_hash=EXCLUDED.link_token_hash,expires_at=EXCLUDED.expires_at,requested_at=NOW(),attempts=0,hour_requests=CASE WHEN password_reset_codes.hour_window_started_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE password_reset_codes.hour_requests+1 END,hour_window_started_at=CASE WHEN password_reset_codes.hour_window_started_at < NOW()-INTERVAL '1 hour' THEN NOW() ELSE password_reset_codes.hour_window_started_at END,created_at=NOW()",
      [account.uid,email,digest(code),digest(linkToken)],
    );
    await sendEmail({
      to: email,
      subject: "Reset your Piano Coach password",
      text: `Use this six-digit code to reset your Piano Coach password: ${code}. It expires in five minutes. You can also use this secure reset link (also expires in five minutes): ${link}`,
      html: `<div style="font-family:Arial,sans-serif;color:#242423;max-width:520px;margin:auto;padding:28px"><h1 style="color:#6f8d5d">Reset your password</h1><p>Use this six-digit code in Piano Coach. It expires in five minutes.</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>Or use this secure reset link, which also expires in five minutes:</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#9dc183;color:#242423;text-decoration:none;border-radius:8px">Reset password</a></p><p>If you didn't request this, you can ignore this email.</p></div>`,
    });
    return sendJson(res,200,generic);
  } catch (error) {
    console.error("POST /api/auth/password-reset failed:",error.message);
    return sendJson(res,200,generic);
  }
}
