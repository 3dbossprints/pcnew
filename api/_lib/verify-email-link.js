import { createHash } from "node:crypto";
import { adminAuth } from "./auth.js";
import { database } from "./db.js";
import { requireMethod, sendJson } from "./http.js";
const digest = value => createHash("sha256").update(value).digest("hex");
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const token = String(req.body?.token || "").trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return sendJson(res,400,{error:"This verification link is invalid."});
  try {
    const db=database();
    const found=await db.query("SELECT firebase_uid,expires_at FROM email_verification_codes WHERE link_token_hash=$1",[digest(token)]);
    if (!found.rowCount) return sendJson(res,400,{error:"This verification link is invalid or has already been used."});
    const row=found.rows[0];
    if (new Date(row.expires_at).getTime()<=Date.now()) {
      await db.query("DELETE FROM email_verification_codes WHERE firebase_uid=$1",[row.firebase_uid]);
      return sendJson(res,400,{error:"This verification link has expired. Request a new one."});
    }
    await adminAuth().updateUser(row.firebase_uid,{emailVerified:true});
    await db.query("DELETE FROM email_verification_codes WHERE firebase_uid=$1",[row.firebase_uid]);
    return sendJson(res,200,{verified:true});
  } catch(error) {
    console.error("POST /api/auth/verify-email-link failed:",error.message);
    return sendJson(res,503,{error:"We couldn't verify this link just now. Please try again."});
  }
}
