import { requireUser } from "./_lib/auth.js";
import { database } from "./_lib/db.js";
import { requireMethod, sendJson } from "./_lib/http.js";

const boards = new Set(["RSL Awards", "ABRSM", "LCME", "Trinity College London", "MTB", "VCM", "NCM"]);
const grades = new Set(["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"]);
const plans = new Set(["free", "basic", "pro"]);
const themes = new Set(["light", "dark", "contrast"]);
const notationStyles = new Set(["standard", "closer", "larger", "inverted"]);

function cleanSchedule(value) {
  if (!Array.isArray(value) || value.length > 7) throw new Error("Choose valid reminder days and times.");
  return value.map((entry) => {
    const day = Number(entry?.day);
    const times = Array.isArray(entry?.times) ? [...new Set(entry.times.map(String))] : [];
    if (!Number.isInteger(day) || day < 0 || day > 6 || times.length > 8 ||
        times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      throw new Error("Choose valid reminder days and times.");
    }
    return { day, enabled: Boolean(entry.enabled), times };
  });
}

function validTimezone(value) {
  if (typeof value !== "string" || value.length > 80) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, "PATCH")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before continuing." });

  const body = req.body || {};
  const onboardingRequested = ["examBoard", "grade", "plan"].some((key) => Object.hasOwn(body, key));
  if (onboardingRequested && (!boards.has(body.examBoard) || !grades.has(body.grade) || !plans.has(body.plan))) {
    return sendJson(res, 400, { error: "Choose a valid exam board, grade and plan." });
  }
  if (onboardingRequested && body.plan !== "free" && !["monthly", "annual"].includes(body.interval)) {
    return sendJson(res, 400, { error: "Choose monthly or annual billing." });
  }
  if (onboardingRequested && body.plan === "free" && body.bookSources?.length) {
    return sendJson(res, 400, { error: "The free demo does not require exam books." });
  }

  const sources = Array.isArray(body.bookSources) ? body.bookSources.slice(0, 12).map((item) => ({
    title: String(item.title || "").trim().slice(0, 160),
    url: String(item.url || "").trim().slice(0, 1000),
    category: ["repertoire", "scales", "sight-reading", "technique"].includes(item.category) ? item.category : "repertoire",
  })).filter((item) => item.title && /^https:\/\//i.test(item.url)) : [];
  const hasTargetDate = Object.hasOwn(body, "targetDate");
  const targetDate = hasTargetDate && body.targetDate ? String(body.targetDate) : null;
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return sendJson(res, 400, { error: "Choose a valid target date." });
  }

  const displayName = Object.hasOwn(body, "displayName") ? String(body.displayName || "").trim() : null;
  const preferredName = Object.hasOwn(body, "preferredName") ? String(body.preferredName || "").trim() : null;
  if (displayName !== null && (!displayName || displayName.length > 100)) return sendJson(res, 400, { error: "Your name must be between 1 and 100 characters." });
  if (preferredName !== null && preferredName.length > 60) return sendJson(res, 400, { error: "Your preferred name must be 60 characters or fewer." });

  let preferences = null;
  let timezone = null;
  try {
    if (body.preferences !== undefined) {
      const input = body.preferences || {};
      const current = await database().query(
        "SELECT notation_style, theme, reminders_email, reminders_browser, timezone, reminder_schedule FROM student_preferences WHERE firebase_uid = $1",
        [user.uid],
      );
      const old = current.rows[0] || {};
      preferences = {
        notationStyle: input.notationStyle ?? old.notation_style ?? "standard",
        theme: input.theme ?? old.theme ?? "light",
        remindersEmail: input.remindersEmail ?? old.reminders_email ?? true,
        remindersBrowser: input.remindersBrowser ?? old.reminders_browser ?? false,
        reminderSchedule: input.reminderSchedule !== undefined ? cleanSchedule(input.reminderSchedule) : old.reminder_schedule || [],
      };
      timezone = input.timezone ?? old.timezone ?? null;
      if (!notationStyles.has(preferences.notationStyle) || !themes.has(preferences.theme) ||
          typeof preferences.remindersEmail !== "boolean" || typeof preferences.remindersBrowser !== "boolean" ||
          (timezone !== null && !validTimezone(timezone))) {
        return sendJson(res, 400, { error: "One or more preference settings are invalid." });
      }
    }
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "One or more preference settings are invalid." });
  }

  try {
    const db = database();
    await db.query(
      "UPDATE users SET " +
      "display_name = CASE WHEN $2 THEN $3 ELSE display_name END, " +
      "preferred_name = CASE WHEN $4 THEN $5 ELSE preferred_name END, " +
      "target_date = CASE WHEN $6 THEN $7::date ELSE target_date END, " +
      "exam_board = CASE WHEN $8 THEN $9 ELSE exam_board END, " +
      "grade = CASE WHEN $10 THEN $11 ELSE grade END, updated_at = NOW() WHERE firebase_uid = $1",
      [user.uid, displayName !== null, displayName, Object.hasOwn(body, "preferredName"), preferredName, hasTargetDate, targetDate, Object.hasOwn(body, "examBoard"), body.examBoard || null, Object.hasOwn(body, "grade"), body.grade || null],
    );

    if (onboardingRequested) {
      await db.query(
        "UPDATE users SET plan = CASE WHEN $4 = 'free' THEN 'free' ELSE plan END, " +
        "pending_plan = CASE WHEN $4 = 'free' THEN NULL ELSE $4 END, pending_interval = CASE WHEN $4 = 'free' THEN NULL ELSE $7 END, " +
        "book_sources = $6::jsonb, exam_book_skipped = CASE WHEN $4 = 'free' THEN false ELSE $8 END, " +
        "onboarding_completed = ($4 = 'free'), demo_started_at = CASE WHEN $4 = 'free' AND demo_started_at IS NULL THEN NOW() ELSE demo_started_at END, " +
        "updated_at = NOW() WHERE firebase_uid = $1",
        [user.uid, body.examBoard, body.grade, body.plan, targetDate, JSON.stringify(sources), body.interval || null, body.plan === "free" ? false : Boolean(body.examBookSkipped)],
      );
    }

    if (preferences) {
      await db.query(
        "INSERT INTO student_preferences (firebase_uid, notation_style, theme, reminders_email, reminders_browser, timezone, reminder_schedule, updated_at) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW()) ON CONFLICT (firebase_uid) DO UPDATE SET " +
        "notation_style=EXCLUDED.notation_style, theme=EXCLUDED.theme, reminders_email=EXCLUDED.reminders_email, " +
        "reminders_browser=EXCLUDED.reminders_browser, timezone=EXCLUDED.timezone, reminder_schedule=EXCLUDED.reminder_schedule, updated_at=NOW()",
        [user.uid, preferences.notationStyle, preferences.theme, preferences.remindersEmail, preferences.remindersBrowser, timezone, JSON.stringify(preferences.reminderSchedule)],
      );
      if (timezone) await db.query("UPDATE users SET timezone=$2, updated_at=NOW() WHERE firebase_uid=$1", [user.uid, timezone]);
    }

    const result = await db.query(
      "SELECT id,email,display_name,preferred_name,exam_board,grade,target_date,plan,pending_plan,pending_interval," +
      "onboarding_completed,book_sources,exam_book_file_id,exam_book_skipped,demo_seconds_used,subscription_status," +
      "stripe_customer_id,subscription_interval,subscription_current_period_end,cancel_at_period_end " +
      "FROM users WHERE firebase_uid=$1",
      [user.uid],
    );
    const preferenceResult = await db.query(
      "SELECT notation_style,theme,reminders_email,reminders_browser,timezone,reminder_schedule FROM student_preferences WHERE firebase_uid=$1",
      [user.uid],
    );
    return sendJson(res, 200, { user: result.rows[0], preferences: preferenceResult.rows[0] || null });
  } catch (error) {
    console.error("PATCH /api/profile failed:", error.message);
    return sendJson(res, 503, { error: "Your changes couldn't be saved. Please try again." });
  }
}
