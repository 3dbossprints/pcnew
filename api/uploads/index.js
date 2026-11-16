import { timingSafeEqual } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
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

export default async function handler(req, res) {
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

  return sendJson(res, 410, { error: "Score recognition runs locally in the browser. No external OMR service or API key is used." });
}
