import { randomUUID } from "node:crypto";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  const action = req.query?.action || (req.url?.split("/").pop() || "");
  if (action === "start") return startSession(req, res);
  if (action === "finish") return finishSession(req, res);
  return sendJson(res, 404, { error: "Unknown practice action." });
}

async function startSession(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before practising." });
  const { mode = "standard", taskId = null, referenceFileId = null, practiceType = "graded", sectionKey = "full" } = req.body || {};
  if (!["graded", "personal"].includes(practiceType)) return sendJson(res, 400, { error: "Choose a valid practice type." });
  if (!["assisted", "standard"].includes(mode)) return sendJson(res, 400, { error: "Choose a valid practice mode." });
  if (taskId !== null && (typeof taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(taskId))) return sendJson(res, 400, { error: "Invalid practice task." });
  if (referenceFileId !== null && (typeof referenceFileId !== "string" || !/^[0-9a-f-]{36}$/i.test(referenceFileId))) return sendJson(res, 400, { error: "Invalid sheet music reference." });
  if (typeof sectionKey !== "string" || sectionKey.length > 40 || !/^(full|section-[1-9]\d{0,2})$/.test(sectionKey)) return sendJson(res, 400, { error: "Choose a valid practice section." });
  try {
    if (taskId) {
      const task = await database().query("SELECT id FROM practice_tasks WHERE id=$1 AND firebase_uid=$2 AND is_archived=false", [taskId,user.uid]);
      if (!task.rowCount) return sendJson(res, 404, { error: "This learning task is not available in your Grade Plan." });
    }
    if (referenceFileId) {
      const reference = await database().query("SELECT id FROM user_files WHERE id=$1 AND firebase_uid=$2 AND status='ready' AND kind='sheet' AND ($3='graded' OR metadata->>'purpose'='personal_piece')", [referenceFileId,user.uid,practiceType]);
      if (!reference.rowCount) return sendJson(res, 404, { error: "The selected book or score is not available in your library." });
    }
    const account = await database().query("SELECT plan,demo_seconds_used,exam_book_file_id FROM users WHERE firebase_uid=$1",[user.uid]);
    if (!account.rowCount) return sendJson(res,404,{error:"Complete your account setup first."});
    if (practiceType==="graded" && account.rows[0].plan!=="free" && !account.rows[0].exam_book_file_id) return sendJson(res,403,{error:"Upload your exam-board ebook to unlock graded learning. You can still practise your own pieces in Pro Extras."});
    if (practiceType==="personal" && account.rows[0].plan!=="pro") return sendJson(res,403,{error:"Personal-piece practice in Extras requires Piano Coach Pro."});
    if (practiceType==="personal" && !referenceFileId) return sendJson(res,400,{error:"Choose one of your uploaded personal pieces first."});
    if (account.rows[0].plan==="free" && account.rows[0].demo_seconds_used>=3600) return sendJson(res,403,{error:"Your free 60-minute demo has been used. Subscribe to continue practising."});
    const id=randomUUID();
    let result;
    try {
      result = await database().query(
        "INSERT INTO practice_sessions(id,firebase_uid,task_id,section_key,reference_file_id,started_at,mode) " +
        "VALUES($1,$2,$3,$4,$5,NOW(),$6) RETURNING id,started_at,mode,task_id,section_key,reference_file_id",
        [id,user.uid,taskId,sectionKey,referenceFileId,mode],
      );
    } catch (schemaError) {
      if (!["42P01", "42703"].includes(schemaError.code) || taskId || sectionKey !== "full") throw schemaError;
      result = await database().query(
        referenceFileId
          ? "INSERT INTO practice_sessions(id,firebase_uid,task_id,reference_file_id,started_at,mode) VALUES($1,$2,$3,$4,NOW(),$5) RETURNING id,started_at,mode,reference_file_id"
          : "INSERT INTO practice_sessions(id,firebase_uid,task_id,started_at,mode) VALUES($1,$2,$3,NOW(),$4) RETURNING id,started_at,mode",
        referenceFileId ? [id,user.uid,taskId,referenceFileId,mode] : [id,user.uid,taskId,mode],
      );
    }
    return sendJson(res,201,{session:result.rows[0]});
  } catch(error) {
    console.error("POST /api/practice/start failed:",error.message);
    return sendJson(res,503,{error:"Your practice session couldn't be started."});
  }
}

async function finishSession(req, res) {
  if (!requireMethod(req, res, "PATCH")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const { sessionId, durationSeconds, score = null, feedback = null, recordingFileId = null } = req.body || {};
  if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) return sendJson(res, 400, { error: "A valid practice session is required." });
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 14400) return sendJson(res, 400, { error: "Practice duration must be between 0 and 4 hours." });
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) return sendJson(res, 400, { error: "Score must be between 0 and 100." });
  if (feedback !== null && (typeof feedback !== "object" || Array.isArray(feedback) || JSON.stringify(feedback).length > 20000)) return sendJson(res, 400, { error: "Practice feedback is invalid or too large." });
  if (recordingFileId !== null && (typeof recordingFileId !== "string" || !/^[0-9a-f-]{36}$/i.test(recordingFileId))) return sendJson(res, 400, { error: "Recording reference is invalid." });
  try {
    const db = database();
    const account = await db.query("SELECT plan, demo_seconds_used FROM users WHERE firebase_uid=$1", [user.uid]);
    if (!account.rowCount) return sendJson(res, 404, { error: "Your account could not be found." });
    const safeDurationSeconds = account.rows[0].plan === "free"
      ? Math.min(durationSeconds, Math.max(0, 3600 - Number(account.rows[0].demo_seconds_used || 0)))
      : durationSeconds;
    if (recordingFileId) {
      const file = await db.query("SELECT id FROM user_files WHERE id=$1 AND firebase_uid=$2 AND status='ready' AND kind='audio'", [recordingFileId, user.uid]);
      if (!file.rowCount) return sendJson(res, 404, { error: "The session recording is not available in your library." });
    }
    let result;
    try {
      result = await db.query(
        "WITH completed AS (" +
        " UPDATE practice_sessions SET ended_at=NOW(),duration_seconds=$3,score=$4,feedback=$5::jsonb,recording_file_id=$6 " +
        " WHERE id=$1 AND firebase_uid=$2 AND ended_at IS NULL " +
        " RETURNING id,firebase_uid,task_id,section_key,started_at,ended_at,duration_seconds,mode,score,feedback,recording_file_id" +
        "), counted AS (" +
        " UPDATE users SET demo_seconds_used=CASE WHEN plan='free' THEN LEAST(3600,demo_seconds_used+(SELECT duration_seconds FROM completed)) ELSE demo_seconds_used END,updated_at=NOW() " +
        " WHERE firebase_uid=(SELECT firebase_uid FROM completed) RETURNING demo_seconds_used" +
        "), attempt AS (" +
        " INSERT INTO practice_task_attempts(firebase_uid,task_id,session_id,section_key,score,duration_seconds) " +
        " SELECT firebase_uid,task_id,id,COALESCE(section_key,'full'),score,duration_seconds FROM completed WHERE task_id IS NOT NULL " +
        " ON CONFLICT(session_id) DO NOTHING RETURNING id" +
        ") SELECT completed.*,counted.demo_seconds_used FROM completed CROSS JOIN counted",
        [sessionId, user.uid, safeDurationSeconds, score, feedback === null ? null : JSON.stringify(feedback), recordingFileId],
      );
    } catch (schemaError) {
      if (!["42P01", "42703"].includes(schemaError.code)) throw schemaError;
      result = await db.query(
        "WITH completed AS (" +
        " UPDATE practice_sessions SET ended_at=NOW(),duration_seconds=$3,score=$4 " +
        " WHERE id=$1 AND firebase_uid=$2 AND ended_at IS NULL " +
        " RETURNING id,firebase_uid,started_at,ended_at,duration_seconds,mode,score" +
        "), counted AS (" +
        " UPDATE users SET demo_seconds_used=CASE WHEN plan='free' THEN LEAST(3600,demo_seconds_used+(SELECT duration_seconds FROM completed)) ELSE demo_seconds_used END,updated_at=NOW() " +
        " WHERE firebase_uid=(SELECT firebase_uid FROM completed) RETURNING demo_seconds_used" +
        ") SELECT completed.*,counted.demo_seconds_used FROM completed CROSS JOIN counted",
        [sessionId, user.uid, safeDurationSeconds, score],
      );
    }
    if (!result.rowCount) return sendJson(res, 404, { error: "This session is already finished or doesn't belong to your account." });
    return sendJson(res, 200, { session: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/practice/finish failed:", error.message);
    return sendJson(res, 503, { error: "Your practice session couldn't be saved." });
  }
}
