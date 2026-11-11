import { requireUser } from "./_lib/auth.js";
import { database } from "./_lib/db.js";
import { requireMethod, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before continuing." });
  try {
    const db = database();
    const result = await db.query(
      "INSERT INTO users (firebase_uid, email, display_name) VALUES ($1, $2, $3) " +
      "ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, " +
      "display_name = COALESCE(users.display_name, EXCLUDED.display_name), updated_at = NOW() " +
      "RETURNING id, email, display_name, preferred_name, exam_board, grade, target_date, timezone, plan, pending_plan, pending_interval, stripe_customer_id, subscription_status, subscription_current_period_end, cancel_at_period_end, subscription_interval, " +
      "onboarding_completed, book_sources, exam_book_file_id, exam_book_skipped, exam_book_uploaded_at, demo_seconds_used, created_at",
      [user.uid, user.email, user.name],
    );
    const practice = await db.query(
      "SELECT COALESCE(SUM(duration_seconds) FILTER (WHERE started_at >= date_trunc('week', NOW())), 0)::int AS weekly_seconds, " +
      "COUNT(*) FILTER (WHERE started_at >= date_trunc('week', NOW()))::int AS sessions_this_week, " +
      "COALESCE(SUM(duration_seconds), 0)::int AS lifetime_seconds, " +
      "COALESCE(SUM(duration_seconds) FILTER (WHERE started_at::date = CURRENT_DATE), 0)::int AS today_seconds " +
      "FROM practice_sessions WHERE firebase_uid = $1 AND ended_at IS NOT NULL",
      [user.uid],
    );
    const days = await db.query(
      "SELECT started_at::date::text AS practice_date, SUM(duration_seconds)::int AS seconds " +
      "FROM practice_sessions WHERE firebase_uid = $1 AND ended_at IS NOT NULL " +
      "AND started_at >= NOW() - INTERVAL '90 days' GROUP BY started_at::date ORDER BY practice_date DESC",
      [user.uid],
    );
    const pref = await db.query(
      "SELECT notation_style,theme,reminders_email,reminders_browser,timezone,reminder_schedule " +
      "FROM student_preferences WHERE firebase_uid=$1",
      [user.uid],
    );
    const tasks = await db.query(
      "SELECT id,category,title,composer,notes,source_file_id,section_count,is_archived,created_at,updated_at " +
      "FROM practice_tasks WHERE firebase_uid=$1 AND is_archived=false ORDER BY category,created_at",
      [user.uid],
    );
    const attempts = await db.query(
      "SELECT task_id,section_key,score,duration_seconds,attempted_at " +
      "FROM practice_task_attempts WHERE firebase_uid=$1 AND attempted_at >= NOW()-INTERVAL '365 days' " +
      "ORDER BY attempted_at DESC LIMIT 1000",
      [user.uid],
    );
    const completedDays = new Set(days.rows.filter((row) => Number(row.seconds) >= 900).map((row) => row.practice_date));
    const today = new Date();
    const utcDate = (date) => date.toISOString().slice(0, 10);
    const streakStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (!completedDays.has(utcDate(streakStart))) streakStart.setUTCDate(streakStart.getUTCDate() - 1);
    let streakDays = 0;
    for (let offset = 0; offset < 90; offset += 1) {
      const date = new Date(streakStart);
      date.setUTCDate(date.getUTCDate() - offset);
      if (!completedDays.has(utcDate(date))) break;
      streakDays += 1;
    }
    const practiceSummary = {
      weeklySeconds: Number(practice.rows[0]?.weekly_seconds || 0),
      sessionsThisWeek: Number(practice.rows[0]?.sessions_this_week || 0),
      lifetimeSeconds: Number(practice.rows[0]?.lifetime_seconds || 0),
      todaySeconds: Number(practice.rows[0]?.today_seconds || 0),
      streakDays,
      practiceDaysThisWeek: days.rows.filter((row) => {
        const date = new Date(row.practice_date + "T00:00:00Z");
        const now = new Date();
        const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        return date >= monday && date <= now && Number(row.seconds) >= 900;
      }).length,
    };
    return sendJson(res, 200, { user: result.rows[0], practiceSummary, preferences: pref.rows[0] || null, tasks: tasks.rows, attempts: attempts.rows });
  } catch (error) {
    console.error("GET /api/me failed:", error.message);
    return sendJson(res, 503, { error: "Your account could not be loaded. Please try again shortly." });
  }
}
