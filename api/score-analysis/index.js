import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireUser } from "../../_lib/auth.js";
import { database } from "../../_lib/db.js";
import { requireMethod, sendJson } from "../../_lib/http.js";

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

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method === "GET") {
    const jobId = typeof req.query?.id === "string" ? req.query.id : "";
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
      console.error("GET /api/score-analysis failed:", error.message);
      return sendJson(res, 503, { error: "Analysis status is temporarily unavailable. Apply migration 009 first." });
    }
  }
  if (!requireMethod(req, res, "POST")) return;
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
        documentType: type, callbackUrl: base + "/api/score-analysis/callback",
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("The recognition worker rejected the job (" + response.status + ").");
    await database().query("UPDATE score_analysis_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1", [jobId]);
    return sendJson(res, 202, { job: { id: jobId, status: "processing", message: "Your score has been queued for notation recognition." } });
  } catch (error) {
    if (jobId) {
      try {
        await database().query("UPDATE score_analysis_jobs SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1", [jobId, "The recognition worker could not accept this document."]);
      } catch { /* Preserve the original queue error. */ }
    }
    console.error("POST /api/score-analysis failed:", error.message);
    return sendJson(res, 503, { error: "Score analysis could not be queued. Please try again later." });
  }
}
