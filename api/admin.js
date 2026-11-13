import { requireUser } from "./_lib/auth.js";
import { database } from "./_lib/db.js";
import { requireMethod, sendJson } from "./_lib/http.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email first." });
  if (!ADMIN_EMAILS.includes(user.email?.toLowerCase())) return sendJson(res, 403, { error: "Admin access required." });

  try {
    const db = database();
    const [users, sessions, plans, files, tasks, recent] = await Promise.all([
      db.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE plan='free')::int AS free, COUNT(*) FILTER (WHERE plan='basic')::int AS basic, COUNT(*) FILTER (WHERE plan='pro')::int AS pro, COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_this_week, COUNT(*) FILTER (WHERE deletion_requested_at IS NOT NULL AND deletion_scheduled_at > NOW())::int AS pending_deletion FROM users"),
      db.query("SELECT COUNT(*)::int AS total_sessions, COALESCE(SUM(duration_seconds),0)::int AS total_seconds, COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days')::int AS sessions_this_week, COALESCE(AVG(score) FILTER (WHERE score IS NOT NULL),0)::float AS avg_score FROM practice_sessions WHERE ended_at IS NOT NULL"),
      db.query("SELECT plan, COUNT(*)::int AS count, COALESCE(SUM(duration_seconds),0)::int AS practice_seconds FROM practice_sessions ps JOIN users u ON u.firebase_uid=ps.firebase_uid WHERE ps.ended_at IS NOT NULL GROUP BY u.plan"),
      db.query("SELECT COUNT(*)::int AS total_files, COALESCE(SUM(size_bytes),0)::bigint AS total_bytes, COUNT(*) FILTER (WHERE kind='sheet')::int AS sheet_files, COUNT(*) FILTER (WHERE kind='audio')::int AS audio_files FROM user_files WHERE status='ready'"),
      db.query("SELECT COUNT(*)::int AS total_tasks FROM practice_tasks WHERE is_archived=false"),
      db.query("SELECT u.email, u.display_name, u.plan, u.created_at, COALESCE(SUM(ps.duration_seconds),0)::int AS practice_seconds, COUNT(ps.id)::int AS session_count FROM users u LEFT JOIN practice_sessions ps ON ps.firebase_uid=u.firebase_uid AND ps.ended_at IS NOT NULL GROUP BY u.email, u.display_name, u.plan, u.created_at ORDER BY u.created_at DESC LIMIT 50"),
    ]);

    return sendJson(res, 200, {
      stats: {
        users: users.rows[0],
        sessions: sessions.rows[0],
        files: files.rows[0],
        tasks: tasks.rows[0],
        planBreakdown: plans.rows,
      },
      recentUsers: recent.rows,
    });
  } catch (error) {
    console.error("GET /api/admin failed:", error.message);
    return sendJson(res, 503, { error: "Admin data could not be loaded." });
  }
}
