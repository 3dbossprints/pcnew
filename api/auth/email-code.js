import { createHash, randomInt } from "node:crypto";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { sendEmail } from "../_lib/email.js";
import { requireMethod, sendJson } from "../_lib/http.js";

const digest = value => createHash("sha256").update(value).digest("hex");
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.email) return sendJson(res, 400, { error: "Your account does not have a verified email address." });
  if (user.emailVerified) return sendJson(res, 200, { sent: false, verified: true });
  try {
    const db = database();
    const previous = await db.query("SELECT requested_at FROM email_verification_codes WHERE firebase_uid = $1", [user.uid]);
    if (previous.rowCount && Date.now() - new Date(previous.rows[0].requested_at).getTime() < 60_000) {
      return sendJson(res, 429, { error: "Please wait a minute before requesting another code." });
    }
    const recent = await db.query("SELECT COUNT(*)::int AS count FROM email_verification_codes WHERE email = $1 AND requested_at > NOW() - INTERVAL '1 hour'", [user.email]);
    if (recent.rows[0].count >= 5) return sendJson(res, 429, { error: "You've requested several codes. Please try again later." });
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await db.query(
      "INSERT INTO email_verification_codes (firebase_uid,email,code_hash,expires_at,requested_at,attempts,created_at) " +
      "VALUES ($1,$2,$3,NOW()+INTERVAL '5 minutes',NOW(),0,NOW()) " +
      "ON CONFLICT (firebase_uid) DO UPDATE SET email=EXCLUDED.email,code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,requested_at=NOW(),attempts=0,created_at=NOW()",
      [user.uid, user.email, digest(code)],
    );
    await sendEmail({
      to: user.email,
      subject: "Your Piano Coach verification code",
      text: `Your Piano Coach verification code is ${code}. It expires in five minutes. If you didn't request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;color:#242423;max-width:520px;margin:auto;padding:28px"><h1 style="color:#6f8d5d">Verify your email</h1><p>Enter this code in Piano Coach to verify your email address:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>This code expires in five minutes. If you didn't request it, you can ignore this email.</p></div>`,
    });
    return sendJson(res, 200, { sent: true, expiresInSeconds: 300 });
  } catch (error) {
    console.error("POST /api/auth/email-code failed:", error.message);
    return sendJson(res, 503, { error: "We couldn't send a verification code. Please try again shortly." });
  }
}
