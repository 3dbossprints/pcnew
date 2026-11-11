import { randomUUID } from "node:crypto";
import { requireUser } from "./_lib/auth.js";
import { database } from "./_lib/db.js";
import { requireMethod, sendJson } from "./_lib/http.js";

const boards = new Set(["RSL Awards", "ABRSM", "LCME", "Trinity College London", "MTB", "VCM", "NCM"]);
const grades = new Set(["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"]);
const plans = new Set(["free", "basic", "pro"]);
const themes = new Set(["light", "dark", "contrast"]);
const notationStyles = new Set(["standard", "closer", "larger", "inverted"]);
const fontSizes = new Set(["normal", "large", "xlarge"]);
const categories = new Set(["pieces", "exercises", "scales"]);

function cleanSchedule(value) {
  if (!Array.isArray(value) || value.length > 7) throw new Error("Choose valid reminder days and times.");
  return value.map((entry) => {
    const day = Number(entry?.day);
    const times = Array.isArray(entry?.times) ? [...new Set(entry.times.map(String))] : [];
    if (!Number.isInteger(day) || day < 0 || day > 6 || times.length > 8 ||
        times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error("Choose valid reminder days and times.");
    return { day, enabled: Boolean(entry.enabled), times };
  });
}
function validTimezone(value) {
  if (typeof value !== "string" || value.length > 80) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
function validUuid(value) { return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value); }

async function saveTask(req, res, user, body) {
  const task = body.taskAction;
  if (!task || !["save", "delete"].includes(task.action)) return sendJson(res, 400, { error: "Choose a valid task action." });
  const db = database();
  if (task.action === "delete") {
    if (!validUuid(task.id)) return sendJson(res, 400, { error: "Invalid task." });
    const removed = await db.query("DELETE FROM practice_tasks WHERE id=$1 AND firebase_uid=$2 RETURNING id", [task.id, user.uid]);
    if (!removed.rowCount) return sendJson(res, 404, { error: "This learning task was not found." });
    return sendJson(res, 200, { deleted: true, id: task.id });
  }
  const id = validUuid(task.id) ? task.id : randomUUID();
  const category = String(task.category || "");
  const title = String(task.title || "").trim().slice(0, 180);
  const composer = String(task.composer || "").trim().slice(0, 160) || null;
  const notes = String(task.notes || "").trim().slice(0, 2000) || null;
  const sectionCount = Number(task.sectionCount || 1);
  const sourceFileId = task.sourceFileId || null;
  if (!categories.has(category) || !title || !Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 100 ||
      (sourceFileId !== null && !validUuid(sourceFileId))) return sendJson(res, 400, { error: "Enter a task title, category and valid section count." });
  if (sourceFileId) {
    const source = await db.query("SELECT id FROM user_files WHERE id=$1 AND firebase_uid=$2 AND status='ready' AND kind='sheet'", [sourceFileId, user.uid]);
    if (!source.rowCount) return sendJson(res, 404, { error: "The linked score is not available in your library." });
  }
  const result = await db.query(
    "INSERT INTO practice_tasks(id,firebase_uid,category,title,composer,notes,source_file_id,section_count) " +
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET " +
    "category=EXCLUDED.category,title=EXCLUDED.title,composer=EXCLUDED.composer,notes=EXCLUDED.notes," +
    "source_file_id=EXCLUDED.source_file_id,section_count=EXCLUDED.section_count,updated_at=NOW() " +
    "WHERE practice_tasks.firebase_uid=$2 " +
    "RETURNING id,category,title,composer,notes,source_file_id,section_count,is_archived,created_at,updated_at",
    [id,user.uid,category,title,composer,notes,sourceFileId,sectionCount],
  );
  if (!result.rowCount) return sendJson(res, 409, { error: "This task could not be saved." });
  return sendJson(res, 200, { task: result.rows[0] });
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, "PATCH")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before continuing." });
  const body = req.body || {};
  if (body.taskAction) {
    try { return await saveTask(req, res, user, body); }
    catch (error) {
      console.error("PATCH /api/profile task action failed:", error.message);
      return sendJson(res, 503, { error: "Your learning task couldn't be saved." });
    }
  }

  const onboardingRequested = ["examBoard", "grade", "plan"].some((key) => Object.hasOwn(body, key));
  if (onboardingRequested && (!boards.has(body.examBoard) || !grades.has(body.grade) || !plans.has(body.plan))) return sendJson(res, 400, { error: "Choose a valid exam board, grade and plan." });
  if (onboardingRequested && body.plan !== "free" && !["monthly", "annual"].includes(body.interval)) return sendJson(res, 400, { error: "Choose monthly or annual billing." });
  if (onboardingRequested && body.plan === "free" && body.bookSources?.length) return sendJson(res, 400, { error: "The free demo does not require exam books." });

  const sources = Array.isArray(body.bookSources) ? body.bookSources.slice(0, 12).map((item) => ({
    title: String(item.title || "").trim().slice(0, 160),
    url: String(item.url || "").trim().slice(0, 1000),
    category: ["repertoire", "scales", "sight-reading", "technique"].includes(item.category) ? item.category : "repertoire",
  })).filter((item) => item.title && /^https:\/\//i.test(item.url)) : [];
  const hasTargetDate = Object.hasOwn(body, "targetDate");
  const targetDate = hasTargetDate && body.targetDate ? String(body.targetDate) : null;
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return sendJson(res, 400, { error: "Choose a valid target date." });

  const displayName = Object.hasOwn(body, "displayName") ? String(body.displayName || "").trim() : null;
  const preferredName = Object.hasOwn(body, "preferredName") ? String(body.preferredName || "").trim() : null;
  if (displayName !== null && (!displayName || displayName.length > 100)) return sendJson(res, 400, { error: "Your name must be between 1 and 100 characters." });
  if (preferredName !== null && preferredName.length > 60) return sendJson(res, 400, { error: "Your preferred name must be 60 characters or fewer." });

  let preferences = null, timezone = null;
  try {
    if (body.preferences !== undefined) {
      const input = body.preferences || {};
      const current = await database().query("SELECT notation_style,theme,font_size,reminders_email,reminders_browser,timezone,reminder_schedule FROM student_preferences WHERE firebase_uid=$1", [user.uid]);
      const old = current.rows[0] || {};
      preferences = {
        notationStyle: input.notationStyle ?? old.notation_style ?? "standard",
        theme: input.theme ?? old.theme ?? "light",
        fontSize: input.fontSize ?? old.font_size ?? "normal",
        remindersEmail: input.remindersEmail ?? old.reminders_email ?? true,
        remindersBrowser: input.remindersBrowser ?? old.reminders_browser ?? false,
        reminderSchedule: input.reminderSchedule !== undefined ? cleanSchedule(input.reminderSchedule) : old.reminder_schedule || [],
      };
      timezone = input.timezone ?? old.timezone ?? null;
      if (!notationStyles.has(preferences.notationStyle) || !themes.has(preferences.theme) || !fontSizes.has(preferences.fontSize) ||
          typeof preferences.remindersEmail !== "boolean" || typeof preferences.remindersBrowser !== "boolean" ||
          (timezone !== null && !validTimezone(timezone))) return sendJson(res, 400, { error: "One or more preference settings are invalid." });
    }
  } catch (error) { return sendJson(res, 400, { error: error.message || "One or more preference settings are invalid." }); }

  try {
    const db = database();
    await db.query(
      "UPDATE users SET display_name=CASE WHEN $2 THEN $3 ELSE display_name END, preferred_name=CASE WHEN $4 THEN $5 ELSE preferred_name END, " +
      "target_date=CASE WHEN $6 THEN $7::date ELSE target_date END, exam_board=CASE WHEN $8 THEN $9 ELSE exam_board END, " +
      "grade=CASE WHEN $10 THEN $11 ELSE grade END, updated_at=NOW() WHERE firebase_uid=$1",
      [user.uid,displayName!==null,displayName,Object.hasOwn(body,"preferredName"),preferredName,hasTargetDate,targetDate,Object.hasOwn(body,"examBoard"),body.examBoard||null,Object.hasOwn(body,"grade"),body.grade||null],
    );
    if (onboardingRequested) {
      await db.query(
        "UPDATE users SET plan=CASE WHEN $4='free' THEN 'free' ELSE plan END, pending_plan=CASE WHEN $4='free' THEN NULL ELSE $4 END, " +
        "pending_interval=CASE WHEN $4='free' THEN NULL ELSE $7 END, book_sources=$6::jsonb, " +
        "exam_book_skipped=CASE WHEN $4='free' THEN false ELSE $8 END, onboarding_completed=($4='free'), " +
        "demo_started_at=CASE WHEN $4='free' AND demo_started_at IS NULL THEN NOW() ELSE demo_started_at END, updated_at=NOW() WHERE firebase_uid=$1",
        [user.uid,body.examBoard,body.grade,body.plan,targetDate,JSON.stringify(sources),body.interval||null,body.plan==="free"?false:Boolean(body.examBookSkipped)],
      );
    }
    if (preferences) {
      try {
        await db.query(
          "INSERT INTO student_preferences(firebase_uid,notation_style,theme,font_size,reminders_email,reminders_browser,timezone,reminder_schedule,updated_at) " +
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW()) ON CONFLICT(firebase_uid) DO UPDATE SET " +
          "notation_style=EXCLUDED.notation_style,theme=EXCLUDED.theme,font_size=EXCLUDED.font_size,reminders_email=EXCLUDED.reminders_email," +
          "reminders_browser=EXCLUDED.reminders_browser,timezone=EXCLUDED.timezone,reminder_schedule=EXCLUDED.reminder_schedule,updated_at=NOW()",
          [user.uid,preferences.notationStyle,preferences.theme,preferences.fontSize,preferences.remindersEmail,preferences.remindersBrowser,timezone,JSON.stringify(preferences.reminderSchedule)],
        );
      } catch (preferenceError) {
        if (preferenceError.code !== "42703") throw preferenceError;
        await db.query(
          "INSERT INTO student_preferences(firebase_uid,notation_style,theme,reminders_email,reminders_browser,timezone,reminder_schedule,updated_at) " +
          "VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW()) ON CONFLICT(firebase_uid) DO UPDATE SET " +
          "notation_style=EXCLUDED.notation_style,theme=EXCLUDED.theme,reminders_email=EXCLUDED.reminders_email," +
          "reminders_browser=EXCLUDED.reminders_browser,timezone=EXCLUDED.timezone,reminder_schedule=EXCLUDED.reminder_schedule,updated_at=NOW()",
          [user.uid,preferences.notationStyle,preferences.theme,preferences.remindersEmail,preferences.remindersBrowser,timezone,JSON.stringify(preferences.reminderSchedule)],
        );
      }
      if (timezone) await db.query("UPDATE users SET timezone=$2,updated_at=NOW() WHERE firebase_uid=$1",[user.uid,timezone]);
    }
    const result = await db.query(
      "SELECT id,email,display_name,preferred_name,exam_board,grade,target_date,plan,pending_plan,pending_interval,onboarding_completed," +
      "book_sources,exam_book_file_id,exam_book_skipped,demo_seconds_used,subscription_status,stripe_customer_id,subscription_interval," +
      "subscription_current_period_end,cancel_at_period_end FROM users WHERE firebase_uid=$1",
      [user.uid],
    );
    const pref = await db.query("SELECT notation_style,theme,reminders_email,reminders_browser,timezone,reminder_schedule FROM student_preferences WHERE firebase_uid=$1",[user.uid]);
    return sendJson(res,200,{user:result.rows[0],preferences:pref.rows[0]||null});
  } catch (error) {
    console.error("PATCH /api/profile failed:",error.message);
    return sendJson(res,503,{error:"Your changes couldn't be saved. Please try again."});
  }
}
