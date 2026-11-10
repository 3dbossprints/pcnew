import Stripe from "stripe";
import { requireUser } from "../_lib/auth.js";
import { database } from "../_lib/db.js";
import { requireMethod, sendJson } from "../_lib/http.js";

let stripeClient;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}
function appUrl() {
  return (process.env.PUBLIC_APP_URL || (process.env.VERCEL_ENV === "production" ? "https://pianocoach.cc.cd" : process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://pianocoach.cc.cd")).replace(/\/+$/, "");
}
function priceFor(plan, interval) {
  const key = "STRIPE_PRICE_" + plan.toUpperCase() + "_" + interval.toUpperCase();
  const price = process.env[key];
  if (!price) throw new Error("The selected subscription price is not configured.");
  return price;
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
      redirect_on_completion:"if_required",
      return_url:appUrl()+"/?checkout=complete&session_id={CHECKOUT_SESSION_ID}",
      customer:customerId,
      client_reference_id:user.uid,
      line_items:[{price:priceFor(plan,interval),quantity:1}],
      metadata:{firebase_uid:user.uid,plan,interval},
      subscription_data:{metadata:{firebase_uid:user.uid,plan,interval}},
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
      if (!customerId) return sendJson(res,404,{error:"No Stripe customer is linked to your account yet."});
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
    const priceId=item?.price?.id || null;
    const periodEnd=subscription.current_period_end || item?.current_period_end || null;
    const proPrices=[process.env.STRIPE_PRICE_PRO_MONTHLY,process.env.STRIPE_PRICE_PRO_ANNUAL].filter(Boolean);
    const selectedPlan=subscription.metadata?.plan || (proPrices.includes(priceId) ? "pro" : "basic");
    const interval=subscription.metadata?.interval || ([process.env.STRIPE_PRICE_BASIC_ANNUAL,process.env.STRIPE_PRICE_PRO_ANNUAL].filter(Boolean).includes(priceId) ? "annual" : "monthly");
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
export default async function handler(req,res) {
  const action=req.query?.action;
  if (action==="checkout") { if (!requireMethod(req,res,"POST")) return; return checkout(req,res); }
  if (action==="portal") { if (!requireMethod(req,res,"POST")) return; return portal(req,res); }
  if (action==="confirm") { if (!requireMethod(req,res,"POST")) return; return confirm(req,res); }
  return sendJson(res,404,{error:"Billing action not found."});
}
