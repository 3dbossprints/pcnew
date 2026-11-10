import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) throw new Error("Cloudflare R2 is not configured.");
  return new S3Client({ region: "auto", endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } });
}
export default async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const { fileId, purpose } = req.body || {};
  if (typeof fileId !== "string" || !/^[0-9a-f-]{36}$/i.test(fileId)) return sendJson(res, 400, { error: "Invalid upload reference." });
  try {
    const found = await database().query(
      "SELECT id, object_key, size_bytes, content_type, kind, metadata FROM user_files WHERE id = $1 AND firebase_uid = $2 AND status = 'pending'",
      [fileId, user.uid],
    );
    if (!found.rowCount) return sendJson(res, 404, { error: "This upload was not found or has already been completed." });
    const expected = found.rows[0];
    const head = await storage().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: expected.object_key }));
    if (Number(head.ContentLength) !== Number(expected.size_bytes) || head.ContentType !== expected.content_type) {
      await database().query("UPDATE user_files SET status = 'failed', updated_at = NOW() WHERE id = $1 AND firebase_uid = $2 AND status = 'pending'", [fileId, user.uid]);
      return sendJson(res, 400, { error: "The uploaded file did not match its expected size and type." });
    }
    const updated = await database().query(
      "UPDATE user_files SET status = 'ready', updated_at = NOW() WHERE id = $1 AND firebase_uid = $2 AND status = 'pending' RETURNING id, original_name, content_type, size_bytes, kind, status, created_at",
      [fileId, user.uid],
    );
    if (!updated.rowCount) return sendJson(res, 409, { error: "This upload has already been completed." });
    const uploadPurpose = expected.metadata?.purpose || purpose || "library";
    if (uploadPurpose === "exam_book") {
      if (expected.kind !== "sheet" || !/\\.(pdf|epub)$/i.test(expected.object_key ? (expected.original_name || "") : "")) return sendJson(res, 415, { error: "Exam-board ebooks must be PDF or EPUB files." });
      await database().query("UPDATE users SET exam_book_file_id = $2, exam_book_skipped = false, exam_book_uploaded_at = NOW(), updated_at = NOW() WHERE firebase_uid = $1", [user.uid, fileId]);
    }
    return sendJson(res, 200, { file: updated.rows[0], purpose: uploadPurpose });
  } catch (error) {
    console.error("POST /api/uploads/complete failed:", error.message);
    return sendJson(res, 503, { error: "We couldn't verify the uploaded file in R2." });
  }
}
