import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const result = await database().query(
      "SELECT id, original_name, content_type, size_bytes, kind, status, metadata, created_at " +
      "FROM user_files WHERE firebase_uid = $1 AND status = 'ready' ORDER BY created_at DESC LIMIT 200",
      [user.uid],
    );
    return sendJson(res, 200, { files: result.rows });
  } catch (error) {
    console.error("GET /api/uploads failed:", error.message);
    return sendJson(res, 503, { error: "Your sheet music library couldn't be loaded." });
  }
}
