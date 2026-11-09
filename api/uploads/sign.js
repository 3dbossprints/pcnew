import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "application/vnd.recordare.musicxml+xml", "application/xml", "application/octet-stream", "audio/mpeg", "audio/mp4", "audio/webm", "audio/midi", "audio/x-midi", "audio/wav", "audio/x-wav"]);
const extensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".xml", ".musicxml", ".mid", ".midi", ".mp3", ".m4a", ".mp4", ".webm", ".wav"]);
function kindFor(name) {
  const ext = name.toLowerCase().slice(name.lastIndexOf("."));
  if ([".mp3", ".m4a", ".mp4", ".webm", ".wav"].includes(ext)) return "audio";
  if ([".png", ".jpg", ".jpeg"].includes(ext)) return "image";
  return "sheet";
}
const maxBytes = 25 * 1024 * 1024;
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
  if (!requireMethod(req, res, "POST")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before uploading." });
  const { filename, contentType, size } = req.body || {};
  const extension = typeof filename === "string" ? filename.toLowerCase().slice(filename.lastIndexOf(".")) : "";
  if (typeof filename !== "string" || !filename.trim() || filename.length > 180 ||
      !extensions.has(extension) || !allowed.has(contentType) || !Number.isInteger(size) || size < 1 || size > maxBytes) {
    return sendJson(res, 400, { error: "Unsupported file or file size. Maximum upload size is 25 MB." });
  }
  try {
    const key = "users/" + user.uid + "/" + randomUUID();
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME, Key: key, ContentType: contentType,
      ContentLength: size, Metadata: { owner: user.uid },
    });
    const uploadUrl = await getSignedUrl(storage(), command, { expiresIn: 300 });
    const result = await database().query(
      "INSERT INTO user_files (firebase_uid, object_key, original_name, content_type, size_bytes, kind, status) " +
      "VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id",
      [user.uid, key, filename.trim(), contentType, size, kindFor(filename)],
    );
    return sendJson(res, 200, { fileId: result.rows[0].id, uploadUrl, objectKey: key, expiresIn: 300 });
  } catch (error) {
    console.error("POST /api/uploads/sign failed:", error.message);
    return sendJson(res, 503, { error: "A secure upload could not be prepared. Please try again." });
  }
}
