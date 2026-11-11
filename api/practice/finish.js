import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

export default async function handler(req,res) {
  if (!requireMethod(req,res,"PATCH")) return;
  const user=await requireUser(req,res);
  if (!user) return;
  const {sessionId,durationSeconds,score=null,feedback=null,recordingFileId=null}=req.body||{};
  if (typeof sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(sessionId)) return sendJson(res,400,{error:"A valid practice session is required."});
  if (!Number.isInteger(durationSeconds)||durationSeconds<0||durationSeconds>14400) return sendJson(res,400,{error:"Practice duration must be between 0 and 4 hours."});
  if (score!==null&&(!Number.isFinite(score)||score<0||score>100)) return sendJson(res,400,{error:"Score must be between 0 and 100."});
  if (feedback!==null&&(typeof feedback!=="object"||Array.isArray(feedback)||JSON.stringify(feedback).length>20000)) return sendJson(res,400,{error:"Practice feedback is invalid or too large."});
  if (recordingFileId!==null&&(typeof recordingFileId!=="string"||!/^[0-9a-f-]{36}$/i.test(recordingFileId))) return sendJson(res,400,{error:"Recording reference is invalid."});
  try {
    const db=database();
    if (recordingFileId) {
      const file=await db.query("SELECT id FROM user_files WHERE id=$1 AND firebase_uid=$2 AND status='ready' AND kind='audio'",[recordingFileId,user.uid]);
      if (!file.rowCount) return sendJson(res,404,{error:"The session recording is not available in your library."});
    }
    const result=await db.query(
      "WITH completed AS ("+
      " UPDATE practice_sessions SET ended_at=NOW(),duration_seconds=$3,score=$4,feedback=$5::jsonb,recording_file_id=$6 "+
      " WHERE id=$1 AND firebase_uid=$2 AND ended_at IS NULL "+
      " RETURNING id,firebase_uid,task_id,section_key,started_at,ended_at,duration_seconds,mode,score,feedback,recording_file_id"+
      "), counted AS ("+
      " UPDATE users SET demo_seconds_used=CASE WHEN plan='free' THEN LEAST(3600,demo_seconds_used+(SELECT duration_seconds FROM completed)) ELSE demo_seconds_used END,updated_at=NOW() "+
      " WHERE firebase_uid=(SELECT firebase_uid FROM completed) RETURNING demo_seconds_used"+
      "), attempt AS ("+
      " INSERT INTO practice_task_attempts(firebase_uid,task_id,session_id,section_key,score,duration_seconds) "+
      " SELECT firebase_uid,task_id,id,COALESCE(section_key,'full'),score,duration_seconds FROM completed WHERE task_id IS NOT NULL "+
      " ON CONFLICT(session_id) DO NOTHING RETURNING id"+
      ") SELECT completed.*,counted.demo_seconds_used FROM completed CROSS JOIN counted",
      [sessionId,user.uid,durationSeconds,score,feedback===null?null:JSON.stringify(feedback),recordingFileId],
    );
    if (!result.rowCount) return sendJson(res,404,{error:"This session is already finished or doesn't belong to your account."});
    return sendJson(res,200,{session:result.rows[0]});
  } catch(error) {
    console.error("PATCH /api/practice/finish failed:",error.message);
    return sendJson(res,503,{error:"Your practice session couldn't be saved."});
  }
}
