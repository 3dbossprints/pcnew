import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const user = await requireUser(req, res);
    if (!user) return;
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
