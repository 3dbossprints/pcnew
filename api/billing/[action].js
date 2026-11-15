import Stripe from "stripe";
import { randomInt } from "node:crypto";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";
import { requireAdmin } from "../_lib/admin.js";
import { listSitePagesForAdmin, readSitePage, saveSitePage } from "../_lib/site-pages.js";

let stripeClient;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}
function generatedDiscountCode() {\n  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";\n  return Array.from({ length: 8 }, () => alphabet[randomInt(0, alphabet.length)]).join("");\n}\nfunction appUrl() {
  return (process.env.PUBLIC_APP_URL || (process.env.VERCEL_ENV === "production" ? "https://pianocoach.cc.cd" : process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://pianocoach.cc.cd")).replace(/\/+$/, "");
}
function priceFor(plan, interval) {
  const key = "STRIPE_PRICE_" + plan.toUpperCase() + "_" + interval.toUpperCase();
  const price = process.env[key];
  if (!price) throw new Error("The selected subscription price is not configured.");
  return price;
}
function planDetailsForSubscription(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const configuredPrices = [
    ["STRIPE_PRICE_BASIC_MONTHLY", "basic", "monthly"],
    ["STRIPE_PRICE_BASIC_ANNUAL", "basic", "annual"],
    ["STRIPE_PRICE_PRO_MONTHLY", "pro", "monthly"],
    ["STRIPE_PRICE_PRO_ANNUAL", "pro", "annual"],
  ];
  const match = configuredPrices.find(([key]) => process.env[key] && process.env[key] === priceId);
  if (match) return { plan: match[1], interval: match[2], priceId };
  const metadataPlan = ["basic", "pro"].includes(subscription.metadata?.plan) ? subscription.metadata.plan : "basic";
  const metadataInterval = ["monthly", "annual"].includes(subscription.metadata?.interval) ? subscription.metadata.interval : "monthly";
  return { plan: metadataPlan, interval: metadataInterval, priceId };
}
async function checkout(req,res) {
  const user = await requireUser(req,res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res,403,{error:"Verify your email before subscribing."});
  const plan = req.body?.plan;
  const interval = req.body?.interval;
  if (!["basic","pro"].includes(plan) || !["monthly","annual"].includes(interval)) {
    return sendJson(res,400,{error:"Choose a valid plan and billing interval."});
  }
  try {
    const db=database();
    const existing=await db.query("SELECT stripe_customer_id,stripe_subscription_id,subscription_status,pending_plan,pending_interval FROM users WHERE firebase_uid=$1",[user.uid]);
    if (!existing.rowCount) return sendJson(res,404,{error:"Your Piano Coach profile could not be found."});
    const current=existing.rows[0];
    if (current.pending_plan !== plan || current.pending_interval !== interval) return sendJson(res,409,{error:"Save your plan choice again before opening checkout."});
    if (current.stripe_subscription_id && ["active","trialing","past_due","unpaid"].includes(current.subscription_status)) {
      return sendJson(res,409,{error:"You already have a subscription. Manage it from Account & billing."});
    }
    let appliedDiscount = null;
    const discountCode = String(req.body?.discountCode || "").trim().toUpperCase();
    if (discountCode) {
      const discountResult = await db.query(
        "SELECT id,code,allowed_email,stripe_promotion_code_id,active,expires_at,max_redemptions,redemption_count FROM discount_codes WHERE code=$1 LIMIT 1",
        [discountCode],
      );
      const candidate = discountResult.rows[0];
      if (!candidate || !candidate.active) return sendJson(res, 400, { error: "That discount code is not valid." });
      if (candidate.allowed_email && candidate.allowed_email.toLowerCase() !== String(user.email || "").toLowerCase()) {
        return sendJson(res, 403, { error: "That discount code is for a different email address." });
      }
      if (candidate.expires_at && new Date(candidate.expires_at).getTime() <= Date.now()) {
        return sendJson(res, 400, { error: "That discount code has expired." });
      }
      if (candidate.max_redemptions && Number(candidate.redemption_count) >= Number(candidate.max_redemptions)) {
        return sendJson(res, 400, { error: "That discount code has reached its redemption limit." });
      }
      appliedDiscount = candidate;
    }
    const stripeApi=stripe();
    let customerId=current.stripe_customer_id;
    if (!customerId) {
      const customer=await stripeApi.customers.create({
        email:user.email || undefined,
        name:user.name || undefined,
        metadata:{firebase_uid:user.uid},
      },{idempotencyKey:"pianocoach-customer-"+user.uid});
      customerId=customer.id;
      await db.query("UPDATE users SET stripe_customer_id=$2,updated_at=NOW() WHERE firebase_uid=$1",[user.uid,customerId]);
    }
    const session=await stripeApi.checkout.sessions.create({
      mode:"subscription",
      ui_mode:"embedded",
      redirect_on_completion:"always",
      return_url:appUrl()+"/?checkout=complete&session_id={CHECKOUT_SESSION_ID}",
      customer:customerId,
      client_reference_id:user.uid,
      line_items:[{price:priceFor(plan,interval),quantity:1}],
      ...(appliedDiscount ? { discounts:[{promotion_code:appliedDiscount.stripe_promotion_code_id}] } : {}),
      metadata:{firebase_uid:user.uid,plan,interval,...(appliedDiscount ? {discount_code_id:appliedDiscount.id} : {})},
      subscription_data:{metadata:{firebase_uid:user.uid,plan,interval,...(appliedDiscount ? {discount_code_id:appliedDiscount.id} : {})}},
      billing_address_collection:"auto",
    },{idempotencyKey:"pianocoach-checkout-"+user.uid+"-"+plan+"-"+interval+"-"+Math.floor(Date.now()/60_000)});
    if (!session.client_secret) return sendJson(res,502,{error:"Stripe did not return an embedded checkout session."});
    return sendJson(res,200,{clientSecret:session.client_secret});
  } catch(error) {
    console.error("POST /api/billing/checkout failed:",error.message);
    return sendJson(res,503,{error:error.message==="The selected subscription price is not configured."?error.message:"We couldn't start secure checkout. Please try again."});
  }
}

async function confirm(req,res) {
  const user=await requireUser(req,res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res,403,{error:"Verify your email before confirming payment."});
  const sessionId=String(req.body?.sessionId || "");
  if (sessionId && !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return sendJson(res,400,{error:"A valid Checkout Session is required."});
  try {
    const stripeApi=stripe();
    let subscription=null;
    let customerId=null;
    if (sessionId) {
      const session=await stripeApi.checkout.sessions.retrieve(sessionId,{expand:["subscription"]});
      if (session.mode!=="subscription" || session.status!=="complete" ||
          (session.payment_status!=="paid" && session.payment_status!=="no_payment_required")) {
        return sendJson(res,202,{pending:true,message:"Stripe is still confirming your payment."});
      }
      const sessionUid=session.client_reference_id || session.metadata?.firebase_uid;
      if (sessionUid!==user.uid) return sendJson(res,403,{error:"This checkout session does not belong to your account."});
      subscription=typeof session.subscription==="string"
        ? await stripeApi.subscriptions.retrieve(session.subscription)
        : session.subscription;
      customerId=typeof session.customer==="string"?session.customer:session.customer?.id || null;
    } else {
      const existing=await database().query("SELECT stripe_customer_id FROM users WHERE firebase_uid=$1",[user.uid]);
      customerId=existing.rows[0]?.stripe_customer_id || null;
      if (!customerId) {
        const customers=await stripeApi.customers.search({query:"metadata['firebase_uid']:'"+user.uid+"'",limit:10});
        const ownedCustomer=customers.data.find(customer=>customer.metadata?.firebase_uid===user.uid);
        customerId=ownedCustomer?.id || null;
      }
      if (!customerId) return sendJson(res,202,{pending:true,message:"We're still locating your Stripe customer record."});
      const subscriptions=await stripeApi.subscriptions.list({customer:customerId,status:"all",limit:100});
      subscription=subscriptions.data.find(item =>
        item.metadata?.firebase_uid===user.uid && ["active","trialing","past_due"].includes(item.status)
      ) || null;
      if (!subscription) return sendJson(res,202,{pending:true,message:"No active subscription is visible in Stripe yet."});
    }
    if (!subscription || subscription.metadata?.firebase_uid!==user.uid) {
      return sendJson(res,403,{error:"The subscription could not be matched securely to your account."});
    }
    if (!["active","trialing","past_due"].includes(subscription.status)) {
      return sendJson(res,202,{pending:true,message:"Your subscription is still being activated by Stripe."});
    }
    const item=subscription.items?.data?.[0];
    const periodEnd=subscription.current_period_end || item?.current_period_end || null;
    // The active Stripe Price is authoritative: subscription metadata is not
    // automatically rewritten when a customer changes plans in the portal.
    const {plan:selectedPlan,interval,priceId}=planDetailsForSubscription(subscription);
    const result=await database().query(
      "UPDATE users SET stripe_customer_id=COALESCE($2,stripe_customer_id),stripe_subscription_id=$3,stripe_price_id=$4,plan=$5,subscription_status=$6,subscription_current_period_end=$7,cancel_at_period_end=$8,subscription_interval=$9,onboarding_completed=TRUE,pending_plan=NULL,pending_interval=NULL,updated_at=NOW() WHERE firebase_uid=$1 RETURNING firebase_uid,onboarding_completed,plan,subscription_status",
      [user.uid,customerId,subscription.id,priceId,selectedPlan,subscription.status,periodEnd?new Date(periodEnd*1000):null,Boolean(subscription.cancel_at_period_end),interval],
    );
    if (!result.rowCount) return sendJson(res,404,{error:"Your Piano Coach profile could not be found."});
    return sendJson(res,200,{confirmed:true,user:result.rows[0]});
  } catch(error) {
    console.error("POST /api/billing/confirm failed:",error.message);
    return sendJson(res,503,{error:"We couldn't confirm your payment yet. Please try again shortly."});
  }
}

async function portal(req,res) {
  const user=await requireUser(req,res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res,403,{error:"Verify your email before managing billing."});
  try {
    const result=await database().query("SELECT stripe_customer_id FROM users WHERE firebase_uid=$1",[user.uid]);
    const customerId=result.rows[0]?.stripe_customer_id;
    if (!customerId) return sendJson(res,404,{error:"There is no Stripe billing account to manage yet."});
    const session=await stripe().billingPortal.sessions.create({customer:customerId,return_url:appUrl()+"/?billing=returned"});
    return sendJson(res,200,{url:session.url});
  } catch(error) {
    console.error("POST /api/billing/portal failed:",error.message);
    return sendJson(res,503,{error:"We couldn't open billing management. Please try again."});
  }
}

async function applyDiscount(req,res) {
  const user = await requireUser(req,res);
  if (!user) return;
  if (!user.emailVerified) return sendJson(res,403,{error:"Verify your email before applying a discount."});
  const code = String(req.body?.discountCode || "").replace(/\\s+/g,"").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,24}$/.test(code)) return sendJson(res,400,{error:"Enter a valid discount code."});
  try {
    const db = database();
    const account = await db.query("SELECT stripe_subscription_id,subscription_status FROM users WHERE firebase_uid=$1",[user.uid]);
    if (!account.rowCount) return sendJson(res,404,{error:"Your Piano Coach profile could not be found."});
    const { stripe_subscription_id: subscriptionId, subscription_status: status } = account.rows[0];
    if (!subscriptionId || !["active","trialing","past_due"].includes(status)) {
      return sendJson(res,409,{error:"There is no active subscription to apply a discount to. Use the checkout discount field when choosing a plan."});
    }
    const found = await db.query(
      "SELECT id,code,allowed_email,stripe_promotion_code_id,active,expires_at,max_redemptions,redemption_count FROM discount_codes WHERE code=$1 LIMIT 1",
      [code],
    );
    const discount = found.rows[0];
    if (!discount || !discount.active) return sendJson(res,400,{error:"That discount code is not valid."});
    if (discount.allowed_email && discount.allowed_email.toLowerCase() !== String(user.email || "").toLowerCase()) {
      return sendJson(res,403,{error:"That discount code is for a different email address."});
    }
    if (discount.expires_at && new Date(discount.expires_at).getTime() <= Date.now()) return sendJson(res,400,{error:"That discount code has expired."});
    if (discount.max_redemptions && Number(discount.redemption_count) >= Number(discount.max_redemptions)) return sendJson(res,400,{error:"That discount code has reached its redemption limit."});
    const stripeApi = stripe();
    const subscription = await stripeApi.subscriptions.retrieve(subscriptionId);
    if (subscription.metadata?.firebase_uid !== user.uid) return sendJson(res,403,{error:"This subscription does not belong to your account."});
    if (subscription.discount || (Array.isArray(subscription.discounts) && subscription.discounts.length)) {
      return sendJson(res,409,{error:"This subscription already has a discount applied. Contact support if you need it changed."});
    }
    await stripeApi.subscriptions.update(subscriptionId,{
      discounts:[{promotion_code:discount.stripe_promotion_code_id}],
      proration_behavior:"none",
    });
    await db.query("UPDATE discount_codes SET redemption_count=redemption_count+1,updated_at=NOW() WHERE id=$1",[discount.id]);
    await db.query(
      "INSERT INTO admin_audit_logs(admin_email,action,entity_type,entity_id,details) SELECT email,'discount.applied','discount_code',$2,$3::jsonb FROM users WHERE firebase_uid=$1 AND EXISTS(SELECT 1 FROM admin_users WHERE lower(admin_users.email)=lower(users.email) AND active=TRUE)",
      [user.uid,discount.id,JSON.stringify({code:discount.code,subscriptionId})],
    ).catch(()=>{});
    return sendJson(res,200,{applied:true,message:"Discount applied. It will be reflected on your next invoice."});
  } catch(error) {
    console.error("POST /api/billing/apply-discount failed:",error.message);
    return sendJson(res,400,{error:"The discount could not be applied. Check the code and subscription status, then try again."});
  }
}

async function adminOverview(req,res) {
  const admin = await requireAdmin(req,res);
  if (!admin) return;
  try {
    const db = database();
    const [users,sessions,plans,files,tasks,recent,admins,discounts,pendingDeletions,audit] = await Promise.all([
      db.query("SELECT COUNT(DISTINCT lower(email))::int AS total, COUNT(DISTINCT lower(email)) FILTER (WHERE plan='free')::int AS free, COUNT(DISTINCT lower(email)) FILTER (WHERE plan='basic')::int AS basic, COUNT(DISTINCT lower(email)) FILTER (WHERE plan='pro')::int AS pro, COUNT(DISTINCT lower(email)) FILTER (WHERE plan IN ('basic','pro') AND subscription_status IN ('active','trialing','past_due'))::int AS paid_students, COUNT(DISTINCT lower(email)) FILTER (WHERE created_at >= NOW()-INTERVAL '7 days')::int AS new_this_week, COUNT(DISTINCT lower(email)) FILTER (WHERE deletion_requested_at IS NOT NULL AND deletion_scheduled_at>NOW())::int AS pending_deletion, (COUNT(*)-COUNT(DISTINCT lower(email)))::int AS duplicate_profiles FROM users"),
      db.query("SELECT COUNT(*)::int AS total_sessions, COALESCE(SUM(duration_seconds),0)::int AS total_seconds, COUNT(*) FILTER (WHERE started_at>=NOW()-INTERVAL '7 days')::int AS sessions_this_week, COALESCE(AVG(score) FILTER (WHERE score IS NOT NULL),0)::float AS avg_score FROM practice_sessions WHERE ended_at IS NOT NULL"),
      db.query("SELECT u.plan,COUNT(DISTINCT lower(u.email))::int AS count,COALESCE(SUM(ps.duration_seconds),0)::int AS practice_seconds FROM users u LEFT JOIN practice_sessions ps ON ps.firebase_uid=u.firebase_uid AND ps.ended_at IS NOT NULL GROUP BY u.plan ORDER BY u.plan"),
      db.query("SELECT COUNT(*)::int AS total_files,COALESCE(SUM(size_bytes),0)::bigint AS total_bytes,COUNT(*) FILTER (WHERE kind='sheet')::int AS sheet_files,COUNT(*) FILTER (WHERE kind='audio')::int AS audio_files FROM user_files WHERE status='ready'"),
      db.query("SELECT COUNT(*)::int AS total_tasks FROM practice_tasks WHERE is_archived=FALSE"),
      db.query("WITH practice_by_user AS (SELECT firebase_uid,COALESCE(SUM(duration_seconds),0)::int AS practice_seconds,COUNT(*)::int AS session_count FROM practice_sessions WHERE ended_at IS NOT NULL GROUP BY firebase_uid), profile_activity AS (SELECT u.firebase_uid,u.email,u.display_name,u.plan,u.subscription_status,u.created_at,u.stripe_subscription_id,COALESCE(p.practice_seconds,0)::int AS practice_seconds,COALESCE(p.session_count,0)::int AS session_count FROM users u LEFT JOIN practice_by_user p ON p.firebase_uid=u.firebase_uid) SELECT lower(email) AS email,COALESCE(MAX(NULLIF(display_name,'')),'Student') AS display_name,CASE WHEN COUNT(*)>1 THEN 'multiple' ELSE MAX(plan) END AS plan,string_agg(DISTINCT upper(plan),' + ' ORDER BY upper(plan)) AS plan_summary,CASE WHEN COUNT(*)>1 THEN 'multiple profiles' ELSE COALESCE(MAX(subscription_status),'free') END AS subscription_status,MIN(created_at) AS created_at,SUM(practice_seconds)::int AS practice_seconds,SUM(session_count)::int AS session_count,COUNT(*)::int AS profile_count,COUNT(DISTINCT stripe_subscription_id) FILTER (WHERE stripe_subscription_id IS NOT NULL AND subscription_status IN ('active','trialing','past_due'))::int AS active_subscriptions FROM profile_activity GROUP BY lower(email) ORDER BY MIN(created_at) DESC LIMIT 100"),
      db.query("SELECT email,role,active,created_at FROM admin_users ORDER BY created_at"),
      db.query("SELECT id,code,discount_type,discount_value,duration,duration_in_months,allowed_email,max_redemptions,redemption_count,expires_at,active,created_at FROM discount_codes ORDER BY created_at DESC LIMIT 100"),
      db.query("SELECT email,display_name,deletion_requested_at,deletion_scheduled_at FROM users WHERE deletion_requested_at IS NOT NULL AND deletion_scheduled_at>NOW() ORDER BY deletion_scheduled_at"),
      db.query("SELECT admin_email,action,entity_type,entity_id,created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 20"),
    ]);
    return sendJson(res,200,{
      stats:{users:users.rows[0],sessions:sessions.rows[0],files:files.rows[0],tasks:tasks.rows[0],planBreakdown:plans.rows},
      recentUsers:recent.rows,admins:admins.rows,discountCodes:discounts.rows,pendingDeletions:pendingDeletions.rows,auditLog:audit.rows,
    });
  } catch(error) {
    console.error("GET /api/billing/admin failed:",error.message);
    return sendJson(res,503,{error:"Admin data could not be loaded. Check that database migration 014 has been applied."});
  }
}

async function createAdminDiscount(req,res) {
  const admin = await requireAdmin(req,res);
  if (!admin) return;
  const body = req.body || {};
  const code = (String(body.code || "").replace(/\\s+/g, "").trim().toUpperCase() || (body.allowedEmail ? generatedDiscountCode() : ""));
  const discountType = body.discountType;
  const value = Number(body.value);
  const duration = body.duration || "once";
  const allowedEmail = body.allowedEmail ? String(body.allowedEmail).trim().toLowerCase() : null;
  const months = Number(body.durationInMonths || 0);
  const maxRedemptions = body.maxRedemptions === "" || body.maxRedemptions == null ? null : Number(body.maxRedemptions);
  const expiry = body.expiresAt ? new Date(String(body.expiresAt) + "T23:59:59Z") : null;
  if (!/^[A-Z0-9_-]{4,24}$/.test(code)) return sendJson(res,400,{error:"Use a 4–24 character code with letters, numbers, hyphens or underscores."});
  if (!["percent","amount"].includes(discountType) || !Number.isFinite(value) || value <= 0 || (discountType==="percent" && value>100) || (discountType==="amount" && value>9999.99)) {
    return sendJson(res,400,{error:"Enter a valid percentage (up to 100%) or fixed GBP discount."});
  }
  if (!["once","repeating","forever"].includes(duration) || (duration==="repeating" && (!Number.isInteger(months) || months<1 || months>12))) {
    return sendJson(res,400,{error:"Choose a valid discount duration. Repeating discounts can last 1–12 months."});
  }
  if (allowedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedEmail)) return sendJson(res,400,{error:"Enter a valid target email address, or leave it blank for everyone."});
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions<1 || maxRedemptions>1000000)) return sendJson(res,400,{error:"Maximum redemptions must be a positive whole number."});
  if (expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime()<=Date.now())) return sendJson(res,400,{error:"Expiry date must be in the future."});
  let coupon = null;
  let promotion = null;
  try {
    const db = database();
    const existing = await db.query("SELECT id FROM discount_codes WHERE code=$1",[code]);
    if (existing.rowCount) return sendJson(res,409,{error:"That discount code already exists."});
    const stripeApi = stripe();
    coupon = await stripeApi.coupons.create({
      name:"Piano Coach discount " + code,
      ...(discountType==="percent" ? {percent_off:value} : {amount_off:Math.round(value*100),currency:"gbp"}),
      duration,
      ...(duration==="repeating" ? {duration_in_months:months} : {}),
      metadata:{source:"piano_coach_admin",created_by:admin.email,allowed_email:allowedEmail || "all"},
    });
    promotion = await stripeApi.promotionCodes.create({
      coupon:coupon.id,code,active:true,
      ...(maxRedemptions ? {max_redemptions:maxRedemptions} : {}),
      ...(expiry ? {expires_at:Math.floor(expiry.getTime()/1000)} : {}),
    });
    const saved = await db.query(
      "INSERT INTO discount_codes(code,discount_type,discount_value,duration,duration_in_months,allowed_email,stripe_coupon_id,stripe_promotion_code_id,max_redemptions,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,code,discount_type,discount_value,duration,duration_in_months,allowed_email,max_redemptions,redemption_count,expires_at,active,created_at",
      [code,discountType,value,duration,duration==="repeating"?months:null,allowedEmail,coupon.id,promotion.id,maxRedemptions,expiry,admin.email],
    );
    await db.query("INSERT INTO admin_audit_logs(admin_email,action,entity_type,entity_id,details) VALUES($1,'discount.created','discount_code',$2,$3::jsonb)",[admin.email,saved.rows[0].id,JSON.stringify({code,allowedEmail,discountType,value,duration})]);
    return sendJson(res,201,{discountCode:saved.rows[0]});
  } catch(error) {
    if (promotion?.id) { try { await stripe().promotionCodes.update(promotion.id,{active:false}); } catch {} }
    if (coupon?.id) { try { await stripe().coupons.del(coupon.id); } catch {} }
    console.error("POST /api/billing/admin-discounts failed:",error.message);
    return sendJson(res,503,{error:"The discount code could not be created. Check Stripe and database configuration."});
  }
}

async function deactivateAdminDiscount(req,res) {
  const admin = await requireAdmin(req,res);
  if (!admin) return;
  const id = String(req.body?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(res,400,{error:"Choose a valid discount code."});
  try {
    const db = database();
    const found = await db.query("SELECT id,code,stripe_promotion_code_id FROM discount_codes WHERE id=$1",[id]);
    if (!found.rowCount) return sendJson(res,404,{error:"Discount code not found."});
    await stripe().promotionCodes.update(found.rows[0].stripe_promotion_code_id,{active:false});
    await db.query("UPDATE discount_codes SET active=FALSE,updated_at=NOW() WHERE id=$1",[id]);
    await db.query("INSERT INTO admin_audit_logs(admin_email,action,entity_type,entity_id,details) VALUES($1,'discount.deactivated','discount_code',$2,$3::jsonb)",[admin.email,id,JSON.stringify({code:found.rows[0].code})]);
    return sendJson(res,200,{deactivated:true,id});
  } catch(error) {
    console.error("POST /api/billing/admin-discount-deactivate failed:",error.message);
    return sendJson(res,503,{error:"The discount code could not be deactivated."});
  }
}

export default async function handler(req,res) {
  const action=req.query?.action;
  if (action==="checkout") { if (!requireMethod(req,res,"POST")) return; return checkout(req,res); }
  if (action==="portal") { if (!requireMethod(req,res,"POST")) return; return portal(req,res); }\n  if (action==="apply-discount") { if (!requireMethod(req,res,"POST")) return; return applyDiscount(req,res); }
  if (action==="confirm") { if (!requireMethod(req,res,"POST")) return; return confirm(req,res); }
  if (action==="admin") { if (!requireMethod(req,res,"GET")) return; return adminOverview(req,res); }
  if (action==="admin-discounts") { if (req.method==="GET") return adminOverview(req,res); if (!requireMethod(req,res,"POST")) return; return createAdminDiscount(req,res); }
  if (action==="admin-discount-deactivate") { if (!requireMethod(req,res,"POST")) return; return deactivateAdminDiscount(req,res); }
  if (action==="site-page") { if (!requireMethod(req,res,"GET")) return; return readSitePage(req,res); }
  if (action==="admin-site-pages") { if (req.method==="GET") return listSitePagesForAdmin(req,res); if (!requireMethod(req,res,"PUT")) return; return saveSitePage(req,res); }
  return sendJson(res,404,{error:"Billing action not found."});
}
