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
      "onboarding_completed, book_sources, exam_book_file_id, exam_book_skipped, exam_book_uploaded_at, demo_seconds_used, created_at, deletion_requested_at, deletion_scheduled_at, deletion_cancelled_at",
      [user.uid, user.email, user.name],
    );
    const timezone = result.rows[0]?.timezone || "UTC";
    const practice = await db.query(
      "SELECT COALESCE(SUM(ps.duration_seconds) FILTER (WHERE (ps.started_at AT TIME ZONE COALESCE(u.timezone,'UTC')) >= date_trunc('week', NOW() AT TIME ZONE COALESCE(u.timezone,'UTC'))), 0)::int AS weekly_seconds, " +
      "COUNT(*) FILTER (WHERE (ps.started_at AT TIME ZONE COALESCE(u.timezone,'UTC')) >= date_trunc('week', NOW() AT TIME ZONE COALESCE(u.timezone,'UTC')))::int AS sessions_this_week, " +
      "COALESCE(SUM(ps.duration_seconds), 0)::int AS lifetime_seconds, " +
      "COALESCE(SUM(ps.duration_seconds) FILTER (WHERE (ps.started_at AT TIME ZONE COALESCE(u.timezone,'UTC'))::date = (NOW() AT TIME ZONE COALESCE(u.timezone,'UTC'))::date), 0)::int AS today_seconds " +
      "FROM practice_sessions ps JOIN users u ON u.firebase_uid=ps.firebase_uid " +
      "WHERE ps.firebase_uid = $1 AND ps.ended_at IS NOT NULL",
      [user.uid],
    );
    const days = await db.query(
      "SELECT (ps.started_at AT TIME ZONE COALESCE(u.timezone,'UTC'))::date::text AS practice_date, SUM(ps.duration_seconds)::int AS seconds " +
      "FROM practice_sessions ps JOIN users u ON u.firebase_uid=ps.firebase_uid " +
      "WHERE ps.firebase_uid = $1 AND ps.ended_at IS NOT NULL " +
      "AND ps.started_at >= NOW() - INTERVAL '95 days' " +
      "GROUP BY (ps.started_at AT TIME ZONE COALESCE(u.timezone,'UTC'))::date ORDER BY practice_date DESC",
      [user.uid],
    );
    let pref = { rows: [] };
    try {
      pref = await db.query(
        "SELECT notation_style,theme,font_size,reminders_email,reminders_browser,timezone,reminder_schedule " +
        "FROM student_preferences WHERE firebase_uid=$1",
        [user.uid],
      );
    } catch (preferenceError) {
      if (preferenceError.code !== "42703") throw preferenceError;
      pref = await db.query(
        "SELECT notation_style,theme,reminders_email,reminders_browser,timezone,reminder_schedule " +
        "FROM student_preferences WHERE firebase_uid=$1",
        [user.uid],
      );
    }
    let tasks = { rows: [] };
    let attempts = { rows: [] };
    let learningPlanAvailable = true;
    try {
      tasks = await db.query(
        "SELECT id,category,title,composer,notes,source_file_id,section_count,is_archived,created_at,updated_at " +
        "FROM practice_tasks WHERE firebase_uid=$1 AND is_archived=false ORDER BY category,created_at",
        [user.uid],
      );
      try {
        attempts = await db.query(
          "SELECT a.task_id,a.section_key,a.score,a.duration_seconds,a.attempted_at,s.feedback " +
          "FROM practice_task_attempts a LEFT JOIN practice_sessions s ON s.id=a.session_id " +
          "WHERE a.firebase_uid=$1 AND a.attempted_at >= NOW()-INTERVAL '365 days' " +
          "ORDER BY a.attempted_at DESC LIMIT 1000",
          [user.uid],
        );
      } catch (feedbackSchemaError) {
        // Keep the learning plan usable on databases that have the task tables
        // but have not yet received the additive feedback column migration.
        if (feedbackSchemaError.code !== "42703") throw feedbackSchemaError;
        attempts = await db.query(
          "SELECT task_id,section_key,score,duration_seconds,attempted_at " +
          "FROM practice_task_attempts WHERE firebase_uid=$1 AND attempted_at >= NOW()-INTERVAL '365 days' " +
          "ORDER BY attempted_at DESC LIMIT 1000",
          [user.uid],
        );
      }
    } catch (taskError) {
      if (!["42P01", "42703"].includes(taskError.code)) throw taskError;
      learningPlanAvailable = false;
    }
    const completedDays = new Set(days.rows.filter((row) => Number(row.seconds) >= 900).map((row) => row.practice_date));
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type) => parts.find((item) => item.type === type)?.value;
    const todayKey = part("year") + "-" + part("month") + "-" + part("day");
    const todayDate = new Date(todayKey + "T00:00:00Z");
    const utcDate = (date) => date.toISOString().slice(0, 10);
    const streakStart = new Date(todayDate);
    if (!completedDays.has(todayKey)) streakStart.setUTCDate(streakStart.getUTCDate() - 1);
    let streakDays = 0;
    for (let offset = 0; offset < 90; offset += 1) {
      const date = new Date(streakStart);
      date.setUTCDate(date.getUTCDate() - offset);
      if (!completedDays.has(utcDate(date))) break;
      streakDays += 1;
    }
    const localMonday = new Date(todayDate);
    localMonday.setUTCDate(localMonday.getUTCDate() - ((localMonday.getUTCDay() + 6) % 7));
    const mondayKey = utcDate(localMonday);
    const localSunday = new Date(localMonday);
    localSunday.setUTCDate(localSunday.getUTCDate() + 6);
    const sundayKey = utcDate(localSunday);
    const practiceDays = days.rows.filter((row) => Number(row.seconds) >= 900).map((row) => row.practice_date);
    const practiceSummary = {
      weeklySeconds: Number(practice.rows[0]?.weekly_seconds || 0),
      sessionsThisWeek: Number(practice.rows[0]?.sessions_this_week || 0),
      lifetimeSeconds: Number(practice.rows[0]?.lifetime_seconds || 0),
      todaySeconds: Number(practice.rows[0]?.today_seconds || 0),
      streakDays,
      practiceDays,
      practiceDaysThisWeek: practiceDays.filter((date) => date >= mondayKey && date <= sundayKey).length,
    };
    return sendJson(res, 200, { user: result.rows[0], practiceSummary, preferences: pref.rows[0] || null, tasks: tasks.rows, attempts: attempts.rows, learningPlanAvailable });
  } catch (error) {
    console.error("GET /api/me failed:", error.message);
    return sendJson(res, 503, { error: "Your account could not be loaded. Please try again shortly." });
  }
}
