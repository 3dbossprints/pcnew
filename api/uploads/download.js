import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  if (!requireMethod(req, res, "GET")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const fileId = typeof req.query?.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return sendJson(res, 400, { error: "Invalid file reference." });
  try {
    const result = await database().query(
      "SELECT object_key, original_name, content_type FROM user_files WHERE id = $1 AND firebase_uid = $2 AND status = 'ready'",
      [fileId, user.uid],
    );
    if (!result.rowCount) return sendJson(res, 404, { error: "File not found." });
    const file = result.rows[0];
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: file.object_key,
      ResponseContentDisposition: req.query?.inline === "1" ? "inline; filename*=UTF-8''" + encodeURIComponent(file.original_name) : "attachment; filename*=UTF-8''" + encodeURIComponent(file.original_name),
      ResponseContentType: file.content_type });
    const url = await getSignedUrl(storage(), command, { expiresIn: 180 });
    return sendJson(res, 200, { url, expiresIn: 180 });
  } catch (error) {
    console.error("GET /api/uploads/download failed:", error.message);
    return sendJson(res, 503, { error: "A secure download link couldn't be created." });
  }
}
