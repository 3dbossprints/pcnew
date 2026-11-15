import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { requireUser } from "./_lib/auth.js";
import { database } from "./_lib/db.js";
import { requireMethod, sendJson } from "./_lib/http.js";
import { sendEmail } from "./_lib/email.js";

let stripeClient;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

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

function deletionCodeDigest(uid, code) {
  const secret = process.env.ACCOUNT_DELETION_CODE_SECRET || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!secret) throw new Error("Account deletion code signing is not configured.");
  return createHmac("sha256", secret).update(uid + ":" + code).digest("hex");
}

async function sendDeletionCode(req, res, user) {
  if (!user.email) return sendJson(res, 400, { error: "Your account needs a verified email address before deletion." });
  const db = database();
  const current = await db.query("SELECT deletion_scheduled_at FROM users WHERE firebase_uid=$1", [user.uid]);
  if (!current.rowCount) return sendJson(res, 404, { error: "Your Piano Coach profile could not be found." });
  if (current.rows[0].deletion_scheduled_at) return sendJson(res, 409, { error: "Account deletion has already been requested." });
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const digest = deletionCodeDigest(user.uid, code);
  await db.query("DELETE FROM account_deletion_codes WHERE firebase_uid=$1 AND consumed_at IS NULL", [user.uid]);
  const saved = await db.query(
    "INSERT INTO account_deletion_codes(firebase_uid,code_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes') RETURNING id",
    [user.uid, digest],
  );
  try {
    await sendEmail({
      to: user.email,
      subject: "Your Piano Coach account deletion code",
      text: "Your account deletion confirmation code is " + code + ". It expires in 10 minutes. If you did not request this, you can ignore this email.",
      html: "<div style=\"font-family:Arial,sans-serif;color:#242423;max-width:520px;margin:auto;padding:28px\"><p style=\"color:#526d4c;font-weight:700;letter-spacing:.12em\">PIANO COACH</p><h1 style=\"font-size:24px\">Confirm account deletion</h1><p>Enter this six-digit code in Piano Coach to confirm your request.</p><p style=\"font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0\">" + code + "</p><p>This code expires in 10 minutes. If you did not request this, ignore this email.</p></div>",
    });
  } catch (error) {
    await db.query("UPDATE account_deletion_codes SET consumed_at=NOW() WHERE id=$1", [saved.rows[0].id]);
    throw error;
  }
  return sendJson(res, 200, { codeSent: true, message: "A six-digit confirmation code has been emailed to " + user.email + ". It expires in 10 minutes." });
}

async function verifyDeletionCode(req, res, user, body) {
  const code = String(body.deletionAction?.code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { error: "Enter the six-digit code from your email." });
  const db = database();
  const found = await db.query(
    "SELECT id,code_hash,expires_at,attempts FROM account_deletion_codes WHERE firebase_uid=$1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
    [user.uid],
  );
  if (!found.rowCount) return sendJson(res, 404, { error: "Request a new confirmation code first." });
  const saved = found.rows[0];
  if (new Date(saved.expires_at).getTime() <= Date.now()) return sendJson(res, 410, { error: "That code has expired. Request a new one." });
  if (Number(saved.attempts) >= 5) return sendJson(res, 429, { error: "Too many incorrect attempts. Request a new code." });
  const supplied = Buffer.from(deletionCodeDigest(user.uid, code), "hex");
  const expected = Buffer.from(saved.code_hash, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    await db.query("UPDATE account_deletion_codes SET attempts=attempts+1 WHERE id=$1", [saved.id]);
    return sendJson(res, 400, { error: "That code is incorrect. Please check your email and try again." });
  }
  const consumed = await db.query(
    "UPDATE account_deletion_codes SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW() AND attempts<5 RETURNING id",
    [saved.id],
  );
  if (!consumed.rowCount) return sendJson(res, 409, { error: "That code has already been used or has expired. Request a new one." });
  return handleDeletion(req, res, user, { deletionAction: { action: "request" } }, true);
}

async function handleDeletion(req, res, user, body, codeVerified = false) {
  const action = body.deletionAction?.action;
  if (!["request", "cancel"].includes(action)) return sendJson(res, 400, { error: "Choose a valid deletion action." });
  if (action === "request" && !codeVerified) return sendJson(res, 403, { error: "Confirm your email code before requesting account deletion." });
  const db = database();
  const current = await db.query("SELECT deletion_requested_at, deletion_scheduled_at, stripe_subscription_id, subscription_status FROM users WHERE firebase_uid=$1", [user.uid]);
  if (!current.rowCount) return sendJson(res, 404, { error: "Your Piano Coach profile could not be found." });
  const row = current.rows[0];

  if (action === "request") {
    if (row.deletion_scheduled_at) return sendJson(res, 409, { error: "Account deletion has already been requested." });
    const subscriptionId = row.stripe_subscription_id;
    if (subscriptionId && ["active", "trialing", "past_due"].includes(row.subscription_status)) {
      try {
        await stripe().subscriptions.cancel(subscriptionId, { invoice_now: false });
      } catch (stripeError) {
        console.error("Deletion: Stripe subscription cancel failed:", stripeError.message);
      }
    }
    const result = await db.query(
      "UPDATE users SET deletion_requested_at=NOW(), deletion_scheduled_at=NOW()+INTERVAL '15 days', deletion_cancelled_at=NULL, subscription_status='canceled', cancel_at_period_end=TRUE, updated_at=NOW() WHERE firebase_uid=$1 " +
      "RETURNING id,email,display_name,preferred_name,exam_board,grade,target_date,plan,pending_plan,pending_interval,onboarding_completed,book_sources,exam_book_file_id,exam_book_skipped,demo_seconds_used,subscription_status,stripe_customer_id,subscription_interval,subscription_current_period_end,cancel_at_period_end,deletion_requested_at,deletion_scheduled_at,deletion_cancelled_at",
      [user.uid],
    );
    return sendJson(res, 200, { user: result.rows[0] });
  }

  if (action === "cancel") {
    if (!row.deletion_scheduled_at) return sendJson(res, 409, { error: "No deletion request is active." });
    if (new Date(row.deletion_scheduled_at) < new Date()) return sendJson(res, 409, { error: "The grace period has ended and deletion can no longer be cancelled." });
    const result = await db.query(
      "UPDATE users SET deletion_requested_at=NULL, deletion_scheduled_at=NULL, deletion_cancelled_at=NOW(), updated_at=NOW() WHERE firebase_uid=$1 " +
      "RETURNING id,email,display_name,preferred_name,exam_board,grade,target_date,plan,pending_plan,pending_interval,onboarding_completed,book_sources,exam_book_file_id,exam_book_skipped,demo_seconds_used,subscription_status,stripe_customer_id,subscription_interval,subscription_current_period_end,cancel_at_period_end,deletion_requested_at,deletion_scheduled_at,deletion_cancelled_at",
      [user.uid],
    );
    return sendJson(res, 200, { user: result.rows[0] });
  }
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

  if (body.deletionAction) {
    try { return await handleDeletion(req, res, user, body); }
    catch (error) {
      console.error("PATCH /api/profile deletion action failed:", error.message);
      return sendJson(res, 503, { error: "The account deletion request could not be completed." });
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
      let current;
      try {
        current = await database().query("SELECT notation_style,theme,font_size,reminders_email,reminders_browser,timezone,reminder_schedule FROM student_preferences WHERE firebase_uid=$1", [user.uid]);
      } catch (preferenceError) {
        if (preferenceError.code !== "42703") throw preferenceError;
        current = await database().query("SELECT notation_style,theme,reminders_email,reminders_browser,timezone,reminder_schedule FROM student_preferences WHERE firebase_uid=$1", [user.uid]);
      }
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
