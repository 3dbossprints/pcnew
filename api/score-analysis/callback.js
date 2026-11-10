import { timingSafeEqual } from "node:crypto";
import { database } from "../../_lib/db.js";
import { requireMethod, sendJson } from "../../_lib/http.js";

function validSecret(value, expected) {
  if (!value || !expected) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function validMeasures(measures) {
  if (!Array.isArray(measures) || measures.length > 20000) return false;
  return measures.every((m, index) => Number.isInteger(m.page) && m.page > 0 &&
    [m.x, m.y, m.width, m.height].every(Number.isFinite) &&
    m.x >= 0 && m.y >= 0 && m.width > 0 && m.height > 0 &&
    m.x + m.width <= 1.001 && m.y + m.height <= 1.001 &&
    (m.id === undefined || typeof m.id === "string") && index < 20000);
}
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  if (!validSecret(req.headers["x-omr-callback-secret"], process.env.OMR_CALLBACK_SECRET)) {
    return sendJson(res, 401, { error: "Unauthorised analysis callback." });
  }
  const { jobId, status, result, error } = req.body || {};
  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId) ||
      !["processing", "completed", "needs_review", "failed"].includes(status)) {
    return sendJson(res, 400, { error: "Invalid analysis result." });
  }
  if (result !== undefined && (!result || typeof result !== "object" || Array.isArray(result) ||
      (result.measures !== undefined && !validMeasures(result.measures)))) {
    return sendJson(res, 400, { error: "The recognition worker returned invalid measure geometry." });
  }
  try {
    const updated = await database().query(
      "UPDATE score_analysis_jobs SET status = $2, result = $3::jsonb, error_message = $4, updated_at = NOW() WHERE id = $1 RETURNING id",
      [jobId, status, result === undefined ? null : JSON.stringify(result), typeof error === "string" ? error.slice(0, 1000) : null],
    );
    if (!updated.rowCount) return sendJson(res, 404, { error: "Analysis job not found." });
    return sendJson(res, 200, { accepted: true });
  } catch (callbackError) {
    console.error("OMR callback failed:", callbackError.message);
    return sendJson(res, 503, { error: "Analysis result could not be saved." });
  }
}
