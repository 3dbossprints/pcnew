import { createHash, randomBytes, randomInt } from "node:crypto";
import { requireUser } from "./auth.js";
import { database } from "./db.js";
import { sendEmail } from "./email.js";
import { requireMethod, sendJson } from "./http.js";

const digest = value => createHash("sha256").update(value).digest("hex");
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.email) return sendJson(res, 400, { error: "Your account does not have an email address." });
  if (user.emailVerified) return sendJson(res, 200, { sent: false, verified: true });
  try {
    const db = database();
    const previous = await db.query("SELECT requested_at, hour_requests, hour_window_started_at FROM email_verification_codes WHERE firebase_uid = $1", [user.uid]);
    if (previous.rowCount && Date.now() - new Date(previous.rows[0].requested_at).getTime() < 60_000) {
      return sendJson(res, 429, { error: "Please wait a minute before requesting another code." });
    }
    if (previous.rowCount) {
      const row = previous.rows[0];
      const inWindow = Date.now() - new Date(row.hour_window_started_at).getTime() < 60 * 60 * 1000;
      if (inWindow && Number(row.hour_requests) >= 5) return sendJson(res, 429, { error: "You have requested several codes. Please try again later." });
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const linkToken = randomBytes(32).toString("base64url");
    const link = (process.env.PUBLIC_APP_URL || "https://pianocoach.cc.cd") + "/?verifyToken=" + encodeURIComponent(linkToken);
    await db.query(
      "INSERT INTO email_verification_codes (firebase_uid,email,code_hash,link_token_hash,expires_at,requested_at,attempts,created_at) " +
      "VALUES ($1,$2,$3,$4,NOW()+INTERVAL '5 minutes',NOW(),0,NOW()) " +
      "ON CONFLICT (firebase_uid) DO UPDATE SET email=EXCLUDED.email,code_hash=EXCLUDED.code_hash,link_token_hash=EXCLUDED.link_token_hash,expires_at=EXCLUDED.expires_at,requested_at=NOW(),attempts=0,created_at=NOW(),hour_requests=CASE WHEN email_verification_codes.hour_window_started_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE email_verification_codes.hour_requests+1 END,hour_window_started_at=CASE WHEN email_verification_codes.hour_window_started_at < NOW()-INTERVAL '1 hour' THEN NOW() ELSE email_verification_codes.hour_window_started_at END",
      [user.uid, user.email, digest(code), digest(linkToken)],
    );
    await sendEmail({
      to: user.email,
      subject: "Verify your Piano Coach email",
      text: `Your Piano Coach verification code is ${code}. It expires in five minutes. You can also verify using this one-time link (also expires in five minutes): ${link}`,
      html: `<div style="font-family:Arial,sans-serif;color:#242423;max-width:520px;margin:auto;padding:28px"><h1 style="color:#6f8d5d">Verify your email</h1><p>Enter this six-digit code in Piano Coach. It expires in five minutes.</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>Or use this one-time verification link, which also expires in five minutes:</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#9dc183;color:#242423;text-decoration:none;border-radius:8px">Verify email</a></p><p>If you didn't request this, you can ignore this email.</p></div>`,
    });
    return sendJson(res, 200, { sent: true, expiresInSeconds: 300 });
  } catch (error) {
    console.error("POST /api/auth/email-code failed:", error.message);
    return sendJson(res, 503, { error: "We couldn't send a verification link and code. Please try again shortly." });
  }
}
