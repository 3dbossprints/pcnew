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
  const { fileId } = req.body || {};
  if (typeof fileId !== "string" || !/^[0-9a-f-]{36}$/i.test(fileId)) return sendJson(res, 400, { error: "Invalid upload reference." });
  try {
    const found = await database().query(
      "SELECT id, object_key, size_bytes FROM user_files WHERE id = $1 AND firebase_uid = $2 AND status = 'pending'",
      [fileId, user.uid],
    );
    if (!found.rowCount) return sendJson(res, 404, { error: "This upload was not found or has already been completed." });
    const head = await storage().send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: found.rows[0].object_key }));
    if (Number(head.ContentLength) !== Number(found.rows[0].size_bytes)) {
      await database().query("UPDATE user_files SET status = 'failed', updated_at = NOW() WHERE id = $1 AND firebase_uid = $2", [fileId, user.uid]);
      return sendJson(res, 400, { error: "The uploaded file size did not match the original file." });
    }
    const updated = await database().query(
      "UPDATE user_files SET status = 'ready', updated_at = NOW() WHERE id = $1 AND firebase_uid = $2 RETURNING id, original_name, content_type, size_bytes, kind, status, created_at",
      [fileId, user.uid],
    );
    return sendJson(res, 200, { file: updated.rows[0] });
  } catch (error) {
    console.error("POST /api/uploads/complete failed:", error.message);
    return sendJson(res, 503, { error: "We couldn't verify the uploaded file in R2." });
  }
}
