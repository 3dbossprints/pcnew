import { database } from "./db.js";
import { requireAdmin } from "./admin.js";
import { sendJson } from "./http.js";
import { sanitizeLegalHtml } from "./legal-html.js";

const PAGE_TITLES = { privacy: "Privacy Policy", terms: "Terms of Service" };
const MAX_HTML_LENGTH = 200000;

function isKnownSlug(slug) {
  return typeof slug === "string" && Object.hasOwn(PAGE_TITLES, slug);
}

function blankPage(slug) {
  return { slug, title: PAGE_TITLES[slug], html: "", updatedAt: null, updatedBy: null };
}

function toPage(row) {
  return { slug: row.slug, title: row.title, html: row.html_content, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

function withBlankDefaults(rows) {
  const bySlug = new Map(rows.map(row => [row.slug, toPage(row)]));
  return Object.keys(PAGE_TITLES).map(slug => bySlug.get(slug) || blankPage(slug));
}

export async function readSitePage(req,res) {
  const slug = req.query?.slug;
  if (!isKnownSlug(slug)) return sendJson(res,404,{error:"Page not found."});
  try {
    const result = await database().query("SELECT slug,title,html_content,updated_by,updated_at FROM site_pages WHERE slug=$1",[slug]);
    const page = result.rowCount ? toPage(result.rows[0]) : blankPage(slug);
    return sendJson(res,200,{page:{slug:page.slug,title:page.title,html:page.html,updatedAt:page.updatedAt}});
  } catch(error) {
    console.error("GET /api/billing/site-page failed:",error.message);
    return sendJson(res,503,{error:"This page could not be loaded. Please try again shortly."});
  }
}

export async function listSitePagesForAdmin(req,res) {
  const admin = await requireAdmin(req,res);
  if (!admin) return;
  try {
    const result = await database().query("SELECT slug,title,html_content,updated_by,updated_at FROM site_pages");
    return sendJson(res,200,{pages:withBlankDefaults(result.rows)});
  } catch(error) {
    console.error("GET /api/billing/admin-site-pages failed:",error.message);
    return sendJson(res,503,{error:"Legal pages could not be loaded. Check that database migration 015 has been applied."});
  }
}

export async function saveSitePage(req,res) {
  const admin = await requireAdmin(req,res);
  if (!admin) return;
  const slug = req.body?.slug;
  if (!isKnownSlug(slug)) return sendJson(res,400,{error:"Choose a valid page."});
  if (typeof req.body?.html !== "string" || req.body.html.length > MAX_HTML_LENGTH) {
    return sendJson(res,400,{error:"Page content must be text up to 200 KB."});
  }
  const html = sanitizeLegalHtml(req.body.html);
  try {
    const db = database();
    const saved = await db.query(
      "INSERT INTO site_pages(slug,title,html_content,updated_by,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(slug) DO UPDATE SET html_content=EXCLUDED.html_content,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING slug,title,html_content,updated_by,updated_at",
      [slug,PAGE_TITLES[slug],html,admin.email],
    );
    await db.query(
      "INSERT INTO admin_audit_logs(admin_email,action,entity_type,entity_id,details) VALUES($1,'site_page.updated','site_page',$2,$3::jsonb)",
      [admin.email,slug,JSON.stringify({slug,characters:html.length})],
    );
    return sendJson(res,200,{page:toPage(saved.rows[0])});
  } catch(error) {
    console.error("PUT /api/billing/admin-site-pages failed:",error.message);
    return sendJson(res,503,{error:"The page could not be saved. Check that database migration 015 has been applied."});
  }
}
