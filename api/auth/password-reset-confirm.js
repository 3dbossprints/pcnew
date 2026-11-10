import { createHash, timingSafeEqual } from "node:crypto";
import { adminAuth } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";
const digest = value => createHash("sha256").update(value).digest("hex");
function validPassword(value) {
  return typeof value === "string" && value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value) && value.length <= 128;
}
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  const password = req.body?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code) || !validPassword(password)) {
    return sendJson(res,400,{error:"Enter your email, six-digit code and a password with at least 8 characters, including uppercase, lowercase and a number."});
  }
  try {
    const db = database();
    const result = await db.query("SELECT firebase_uid,code_hash,expires_at,attempts FROM password_reset_codes WHERE email=$1",[email]);
    if (!result.rowCount) return sendJson(res,400,{error:"That code is invalid or expired. Request a new reset email."});
    const row = result.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await db.query("DELETE FROM password_reset_codes WHERE firebase_uid=$1",[row.firebase_uid]);
      return sendJson(res,400,{error:"That code has expired. Request a new reset email."});
    }
    if (row.attempts >= 5) return sendJson(res,429,{error:"Too many incorrect attempts. Request a new reset email."});
    const expected=Buffer.from(row.code_hash,"hex"), supplied=Buffer.from(digest(code),"hex");
    if (expected.length!==supplied.length || !timingSafeEqual(expected,supplied)) {
      await db.query("UPDATE password_reset_codes SET attempts=attempts+1 WHERE firebase_uid=$1",[row.firebase_uid]);
      return sendJson(res,400,{error:"That code doesn't match. Check it and try again."});
    }
    await adminAuth().updateUser(row.firebase_uid,{password});
    await adminAuth().revokeRefreshTokens(row.firebase_uid);
    await db.query("DELETE FROM password_reset_codes WHERE firebase_uid=$1",[row.firebase_uid]);
    return sendJson(res,200,{reset:true,message:"Your password has been updated. Sign in with your new password."});
  } catch(error) {
    console.error("POST /api/auth/password-reset-confirm failed:",error.message);
    return sendJson(res,503,{error:"We couldn't reset your password just now. Please try again."});
  }
}
