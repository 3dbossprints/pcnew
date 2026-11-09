import { requireUser } from "./_lib/auth.js";
import { database } from "./_lib/db.js";
import { requireMethod, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before continuing." });
  try {
    const result = await database().query(
      "INSERT INTO users (firebase_uid, email, display_name) VALUES ($1, $2, $3) " +
      "ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, " +
      "display_name = COALESCE(users.display_name, EXCLUDED.display_name), updated_at = NOW() " +
      "RETURNING id, email, display_name, preferred_name, exam_board, grade, target_date, plan, " +
      "onboarding_completed, book_sources, demo_seconds_used, subscription_status, created_at",
      [user.uid, user.email, user.name],
    );
    return sendJson(res, 200, { user: result.rows[0] });
  } catch (error) {
    console.error("GET /api/me failed:", error.message);
    return sendJson(res, 503, { error: "Your account could not be loaded. Please try again shortly." });
  }
}
