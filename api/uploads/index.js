import { timingSafeEqual } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { sendJson } from "../_lib/http.js";

function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) throw new Error("Cloudflare R2 is not configured.");
  return new S3Client({ region: "auto", endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
}
function fileType(name) {
  const ext = name.toLowerCase().split(".").pop();
  return ({ pdf: "pdf", epub: "epub", musicxml: "musicxml", xml: "musicxml", png: "image", jpg: "image", jpeg: "image" })[ext] || null;
}
function validSecret(value, expected) {
  if (!value || !expected) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
  // The worker callback shares this existing upload function so the app stays within
  // Vercel Hobby's 12-serverless-function deployment limit.
  if (req.method === "POST" && req.query?.callback === "1") {
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

  if (req.method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return;
    if (typeof req.query?.analysisJob === "string") {
      const jobId = req.query.analysisJob;
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) return sendJson(res, 400, { error: "Invalid analysis job." });
      try {
        const result = await database().query(
          "SELECT id, status, result, error_message, created_at, updated_at FROM score_analysis_jobs WHERE id = $1 AND firebase_uid = $2",
          [jobId, user.uid],
        );
        if (!result.rowCount) return sendJson(res, 404, { error: "Analysis job not found." });
        const row = result.rows[0];
        return sendJson(res, 200, { job: { id: row.id, status: row.status, result: row.result, message: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at } });
      } catch (error) {
        console.error("GET /api/uploads analysis status failed:", error.message);
        return sendJson(res, 503, { error: "Analysis status is temporarily unavailable. Apply migration 009 first." });
      }
    }
    if (typeof req.query?.analysisFor === "string") {
      const sourceFileId = req.query.analysisFor;
      if (!/^[0-9a-f-]{36}$/i.test(sourceFileId)) return sendJson(res, 400, { error: "Invalid source book reference." });
      try {
        const result = await database().query(
          "SELECT id, original_name, content_type, size_bytes, kind, status, metadata, created_at FROM user_files " +
          "WHERE firebase_uid = $1 AND status = 'ready' AND metadata->>'analysisOnly' = 'true' AND metadata->>'sourceFileId' = $2 " +
          "ORDER BY created_at DESC LIMIT 1",
          [user.uid, sourceFileId],
        );
        return sendJson(res, 200, { file: result.rows[0] || null });
      } catch (error) {
        console.error("GET /api/uploads linked analysis failed:", error.message);
        return sendJson(res, 503, { error: "The linked score analysis could not be loaded." });
      }
    }
    try {
      const result = await database().query(
        "SELECT id, original_name, content_type, size_bytes, kind, status, metadata, created_at " +
        "FROM user_files WHERE firebase_uid = $1 AND status = 'ready' AND COALESCE(metadata->>'analysisOnly', 'false') <> 'true' ORDER BY created_at DESC LIMIT 200",
        [user.uid],
      );
      return sendJson(res, 200, { files: result.rows });
    } catch (error) {
      console.error("GET /api/uploads failed:", error.message);
      return sendJson(res, 503, { error: "Your sheet music library couldn't be loaded." });
    }
  }

  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email before analysing a score." });
  const fileId = req.body?.fileId;
  if (typeof fileId !== "string" || !/^[0-9a-f-]{36}$/i.test(fileId)) return sendJson(res, 400, { error: "Select a valid book or score." });
  if (!process.env.OMR_SERVICE_URL || !process.env.OMR_SERVICE_TOKEN) {
    return sendJson(res, 503, { error: "The score-recognition service has not been connected yet. Your document is safe; analysis is not available until the OMR worker is deployed." });
  }
  let jobId = null;
  try {
    const found = await database().query(
      "SELECT id, object_key, original_name, content_type, size_bytes FROM user_files WHERE id = $1 AND firebase_uid = $2 AND status = 'ready'",
      [fileId, user.uid],
    );
    if (!found.rowCount) return sendJson(res, 404, { error: "Book or score not found in your library." });
    const file = found.rows[0];
    const type = fileType(file.original_name);
    if (!type) return sendJson(res, 415, { error: "Only PDF, EPUB, MusicXML and sheet-music images can be analysed." });
    const inserted = await database().query(
      "INSERT INTO score_analysis_jobs (firebase_uid, file_id, status) VALUES ($1, $2, 'queued') RETURNING id",
      [user.uid, fileId],
    );
    jobId = inserted.rows[0].id;
    const sourceUrl = await getSignedUrl(storage(), new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME, Key: file.object_key,
      ResponseContentDisposition: "inline; filename*=UTF-8''" + encodeURIComponent(file.original_name),
      ResponseContentType: file.content_type,
    }), { expiresIn: 900 });
    const base = (process.env.PUBLIC_APP_URL || "https://pianocoach.cc.cd").replace(/\/$/, "");
    const response = await fetch(process.env.OMR_SERVICE_URL.replace(/\/$/, "") + "/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.OMR_SERVICE_TOKEN },
      body: JSON.stringify({
        jobId, sourceUrl, originalName: file.original_name, contentType: file.content_type,
        documentType: type, callbackUrl: base + "/api/uploads?callback=1",
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("The recognition worker rejected the job (" + response.status + ").");
    await database().query("UPDATE score_analysis_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1", [jobId]);
    return sendJson(res, 202, { job: { id: jobId, status: "processing", message: "Your score has been queued for notation recognition." } });
  } catch (error) {
    if (jobId) {
      try { await database().query("UPDATE score_analysis_jobs SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1", [jobId, "The recognition worker could not accept this document."]); }
      catch { /* Preserve the original queue error. */ }
    }
    console.error("POST /api/uploads score analysis failed:", error.message);
    return sendJson(res, 503, { error: "Score analysis could not be queued. Please try again later." });
  }
}
