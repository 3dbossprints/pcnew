import { requireUser } from "./_lib/auth.js";
import { database } from "./_lib/db.js";
import { requireMethod, sendJson } from "./_lib/http.js";

const boards = new Set(["RSL Awards", "ABRSM", "LCME", "Trinity College London", "MTB", "VCM", "NCM"]);
const grades = new Set(["Initial", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"]);
const plans = new Set(["free", "basic", "pro"]);

export default async function handler(req, res) {
  if (!requireMethod(req, res, "PATCH")) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res, 403, { error: "Verify your email address before continuing." });

  const { examBoard, grade, plan, targetDate, bookSources } = req.body || {};
  if (!boards.has(examBoard) || !grades.has(grade) || !plans.has(plan)) {
    return sendJson(res, 400, { error: "Choose a valid exam board, grade and plan." });
  }
  if (plan !== "free") return sendJson(res, 409, { error: "Paid checkout is not available yet. Choose the free demo for now; no payment has been taken." });
  if (plan !== "free" && (!Array.isArray(bookSources) || bookSources.length === 0)) {
    return sendJson(res, 400, { error: "Add at least one exam-book reference for a paid plan." });
  }
  if (plan === "free" && bookSources?.length) {
    return sendJson(res, 400, { error: "The free demo does not require exam books." });
  }
  const sources = Array.isArray(bookSources) ? bookSources.slice(0, 12).map((item) => ({
    title: String(item.title || "").trim().slice(0, 160),
    url: String(item.url || "").trim().slice(0, 1000),
    category: ["repertoire", "scales", "sight-reading", "technique"].includes(item.category) ? item.category : "repertoire",
  })).filter((item) => item.title && /^https:\/\//i.test(item.url)) : [];
  if (plan !== "free" && sources.length === 0) {
    return sendJson(res, 400, { error: "Enter a book title and a secure https:// link for at least one book." });
  }
  const date = targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : null;

  try {
    const result = await database().query(
      "UPDATE users SET exam_board = $2, grade = $3, plan = $4, target_date = $5, " +
      "book_sources = $6::jsonb, onboarding_completed = TRUE, " +
      "demo_started_at = CASE WHEN $4 = 'free' AND demo_started_at IS NULL THEN NOW() ELSE demo_started_at END, " +
      "updated_at = NOW() WHERE firebase_uid = $1 " +
      "RETURNING id, email, display_name, preferred_name, exam_board, grade, target_date, plan, " +
      "onboarding_completed, book_sources, demo_seconds_used, subscription_status",
      [user.uid, examBoard, grade, plan, date, JSON.stringify(sources)],
    );
    return sendJson(res, 200, { user: result.rows[0] });
  } catch (error) {
    console.error("PATCH /api/profile failed:", error.message);
    return sendJson(res, 503, { error: "Your choices couldn't be saved. Please try again." });
  }
}
