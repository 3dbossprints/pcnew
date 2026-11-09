import { randomUUID } from "node:crypto";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before practising." });
  const { mode = "standard", taskId = null } = req.body || {};
  if (!["assisted", "standard"].includes(mode)) return sendJson(res, 400, { error: "Choose a valid practice mode." });
  if (taskId !== null && (typeof taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(taskId))) {
    return sendJson(res, 400, { error: "Invalid practice task." });
  }
  try {
    const id = randomUUID();
    const result = await database().query(
      "INSERT INTO practice_sessions (id, firebase_uid, task_id, started_at, mode) " +
      "VALUES ($1, $2, $3, NOW(), $4) RETURNING id, started_at, mode",
      [id, user.uid, taskId, mode],
    );
    return sendJson(res, 201, { session: result.rows[0] });
  } catch (error) {
    console.error("POST /api/practice/start failed:", error.message);
    return sendJson(res, 503, { error: "Your practice session couldn't be started." });
  }
}
