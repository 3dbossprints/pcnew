import { randomUUID } from "node:crypto";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before practising." });
  const { mode = "standard", taskId = null, referenceFileId = null } = req.body || {};
  if (!["assisted", "standard"].includes(mode)) return sendJson(res, 400, { error: "Choose a valid practice mode." });
  if (taskId !== null && (typeof taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(taskId))) {
    return sendJson(res, 400, { error: "Invalid practice task." });
  }
  if (referenceFileId !== null && (typeof referenceFileId !== "string" || !/^[0-9a-f-]{36}$/i.test(referenceFileId))) return sendJson(res, 400, { error: "Invalid sheet music reference." });
  try {
    if (referenceFileId) {
      const reference = await database().query("SELECT id FROM user_files WHERE id = $1 AND firebase_uid = $2 AND status = 'ready' AND kind = 'sheet'", [referenceFileId, user.uid]);
      if (!reference.rowCount) return sendJson(res, 404, { error: "The selected book or score is not available in your library." });
    }
    const account = await database().query(
      "SELECT plan, demo_seconds_used FROM users WHERE firebase_uid = $1",
      [user.uid],
    );
    if (!account.rowCount) return sendJson(res, 404, { error: "Complete your account setup first." });
    if (account.rows[0].plan === "free" && account.rows[0].demo_seconds_used >= 3600) {
      return sendJson(res, 403, { error: "Your free 60-minute demo has been used. Subscribe to continue practising." });
    }
    const id = randomUUID();
    const result = await database().query(
      "INSERT INTO practice_sessions (id, firebase_uid, task_id, reference_file_id, started_at, mode) " +
      "VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING id, started_at, mode, reference_file_id",
      [id, user.uid, taskId, referenceFileId, mode],
    );
    return sendJson(res, 201, { session: result.rows[0] });
  } catch (error) {
    console.error("POST /api/practice/start failed:", error.message);
    return sendJson(res, 503, { error: "Your practice session couldn't be started." });
  }
}
