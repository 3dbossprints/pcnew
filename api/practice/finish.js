import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "PATCH")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const { sessionId, durationSeconds, score = null } = req.body || {};
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) return sendJson(res, 400, { error: "A valid practice session is required." });
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 14400) return sendJson(res, 400, { error: "Practice duration must be between 0 and 4 hours." });
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) return sendJson(res, 400, { error: "Score must be between 0 and 100." });
  try {
    const result = await database().query(
      "WITH completed AS (" +
      " UPDATE practice_sessions SET ended_at = NOW(), duration_seconds = $3, score = $4 " +
      " WHERE id = $1 AND firebase_uid = $2 AND ended_at IS NULL " +
      " RETURNING id, firebase_uid, started_at, ended_at, duration_seconds, mode, score" +
      "), counted AS (" +
      " UPDATE users SET demo_seconds_used = CASE WHEN plan = 'free' THEN LEAST(3600, demo_seconds_used + (SELECT duration_seconds FROM completed)) ELSE demo_seconds_used END, updated_at = NOW() " +
      " WHERE firebase_uid = (SELECT firebase_uid FROM completed) RETURNING demo_seconds_used" +
      ") SELECT completed.*, counted.demo_seconds_used FROM completed CROSS JOIN counted",
      [sessionId, user.uid, durationSeconds, score],
    );
    if (!result.rowCount) return sendJson(res, 404, { error: "This session is already finished or doesn't belong to your account." });
    return sendJson(res, 200, { session: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/practice/finish failed:", error.message);
    return sendJson(res, 503, { error: "Your practice session couldn't be saved." });
  }
}
