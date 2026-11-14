import { requireUser } from "./auth.js";
import { database } from "./db.js";
import { sendJson } from "./http.js";

export async function requireAdmin(req,res) {
  const user = await requireUser(req,res);
  if (!user) return null;
  if (!user.emailVerified) { sendJson(res,403,{error:"Verify your email first."}); return null; }
  let result;
  try {
    result = await database().query(
      "SELECT role FROM admin_users WHERE lower(email)=lower($1) AND active=TRUE LIMIT 1",
      [user.email],
    );
  } catch (error) {
    console.error("Admin access lookup failed:",error.message);
    sendJson(res,503,{error:"Admin access is not set up yet. Review and apply database migration 014."});
    return null;
  }
  if (!result.rowCount) { sendJson(res,403,{error:"Admin access required."}); return null; }
  return user;
}
