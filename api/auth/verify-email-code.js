import { createHash, timingSafeEqual } from "node:crypto";
import { adminAuth, requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";
const digest = value => createHash("sha256").update(value).digest("hex");
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const code = String(req.body?.code || "").trim();
  if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { error: "Enter the six-digit code from your email." });
  try {
    const db = database();
    const result = await db.query(
      "SELECT code_hash, expires_at, attempts, email FROM email_verification_codes WHERE firebase_uid = $1",
      [user.uid],
    );
    if (!result.rowCount) return sendJson(res, 400, { error: "Request a new verification code first." });
    const row = result.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await db.query("DELETE FROM email_verification_codes WHERE firebase_uid = $1", [user.uid]);
      return sendJson(res, 400, { error: "That code has expired. Request a new one." });
    }
    if (row.attempts >= 5) return sendJson(res, 429, { error: "Too many incorrect attempts. Request a new code." });
    const expected = Buffer.from(row.code_hash, "hex");
    const supplied = Buffer.from(digest(code), "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      await db.query("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE firebase_uid = $1", [user.uid]);
      return sendJson(res, 400, { error: "That code doesn't match. Check it and try again." });
    }
    if (row.email !== user.email) return sendJson(res, 409, { error: "Your account email has changed. Request a new code." });
    await adminAuth().updateUser(user.uid, { emailVerified: true });
    await db.query("DELETE FROM email_verification_codes WHERE firebase_uid = $1", [user.uid]);
    return sendJson(res, 200, { verified: true });
  } catch (error) {
    console.error("POST /api/auth/verify-email-code failed:", error.message);
    return sendJson(res, 503, { error: "We couldn't verify that code just now. Please try again." });
  }
}
