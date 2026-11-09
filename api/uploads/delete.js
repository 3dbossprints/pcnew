import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) throw new Error("Cloudflare R2 is not configured.");
  return new S3Client({
    region: "auto",
    endpoint: "https://" + R2_ACCOUNT_ID + ".r2.cloudflarestorage.com",
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, "DELETE")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const fileId = typeof req.query?.id === "string" ? req.query.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return sendJson(res, 400, { error: "Invalid file reference." });
  try {
    const found = await database().query(
      "SELECT object_key FROM user_files WHERE id = $1 AND firebase_uid = $2 AND status = 'ready'",
      [fileId, user.uid],
    );
    if (!found.rowCount) return sendJson(res, 404, { error: "File not found." });
    await storage().send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: found.rows[0].object_key,
    }));
    await database().query(
      "DELETE FROM user_files WHERE id = $1 AND firebase_uid = $2 AND status = 'ready'",
      [fileId, user.uid],
    );
    return sendJson(res, 200, { deleted: true, fileId });
  } catch (error) {
    console.error("DELETE /api/uploads failed:", error.message);
    return sendJson(res, 503, { error: "This file couldn't be deleted. Please try again." });
  }
}
