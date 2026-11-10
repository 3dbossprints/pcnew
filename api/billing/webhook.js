import Stripe from "stripe";
import { database } from "../_lib/db.js";
import { sendJson } from "../_lib/http.js";

export const config = { api: { bodyParser: false } };
let stripeClient;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}
async function rawBody(req) {
  const chunks=[];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks);
}
async function persistSubscription(subscription, customerId) {
  const uid=subscription.metadata?.firebase_uid;
  const customer=typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id || customerId;
  let targetUid=uid;
  if (!targetUid && customer) {
    const found=await database().query("SELECT firebase_uid FROM users WHERE stripe_customer_id=$1 OR stripe_subscription_id=$2 LIMIT 1",[customer,subscription.id]);
    targetUid=found.rows[0]?.firebase_uid;
  }
  if (!targetUid) throw new Error("Stripe subscription is not linked to a Piano Coach user.");
  const item=subscription.items?.data?.[0];
  const priceId=item?.price?.id || null;
  const periodEnd=subscription.current_period_end || item?.current_period_end || null;
  const proPrices=[process.env.STRIPE_PRICE_PRO_MONTHLY,process.env.STRIPE_PRICE_PRO_ANNUAL].filter(Boolean);
  const selectedPlan=subscription.metadata?.plan || (proPrices.includes(priceId) ? "pro" : "basic");
  const plan=["active","trialing","past_due"].includes(subscription.status) ? selectedPlan : "free";
  const interval=subscription.metadata?.interval || ([process.env.STRIPE_PRICE_BASIC_ANNUAL,process.env.STRIPE_PRICE_PRO_ANNUAL].filter(Boolean).includes(priceId) ? "annual" : "monthly");
  await database().query(
    "UPDATE users SET stripe_customer_id=COALESCE($2,stripe_customer_id),stripe_subscription_id=$3,stripe_price_id=$4,plan=$5,subscription_status=$6,subscription_current_period_end=$7,cancel_at_period_end=$8,subscription_interval=$9,onboarding_completed=CASE WHEN $6 IN ('active','trialing','past_due') THEN TRUE ELSE onboarding_completed END,pending_plan=CASE WHEN $6 IN ('active','trialing','past_due') THEN NULL ELSE pending_plan END,pending_interval=CASE WHEN $6 IN ('active','trialing','past_due') THEN NULL ELSE pending_interval END,updated_at=NOW() WHERE firebase_uid=$1",
    [targetUid,customer,subscription.id,priceId,plan,subscription.status,periodEnd?new Date(periodEnd*1000):null,Boolean(subscription.cancel_at_period_end),interval],
  );
}
export default async function handler(req,res) {
  if (req.method!=="POST") { res.setHeader("Allow","POST"); return sendJson(res,405,{error:"Method not allowed."}); }
  const secret=process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return sendJson(res,503,{error:"Stripe webhook is not configured."});
  let event;
  try {
    const body=await rawBody(req);
    event=stripe().webhooks.constructEvent(body,req.headers["stripe-signature"],secret);
  } catch(error) {
    console.error("Stripe webhook signature verification failed:",error.message);
    return sendJson(res,400,{error:"Invalid webhook signature."});
  }
  try {
    const db=database();
    const already=await db.query("SELECT stripe_event_id FROM stripe_webhook_events WHERE stripe_event_id=$1",[event.id]);
    if (already.rowCount) return sendJson(res,200,{received:true,duplicate:true});
    const object=event.data.object;
    if (["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type) && object.mode==="subscription" && object.subscription) {
      const subscription=await stripe().subscriptions.retrieve(typeof object.subscription==="string"?object.subscription:object.subscription.id);
      await persistSubscription(subscription,typeof object.customer==="string"?object.customer:object.customer?.id);
    } else if (event.type==="checkout.session.async_payment_failed" && object.mode==="subscription") {
      if (object.client_reference_id) await db.query("UPDATE users SET plan='free',subscription_status='incomplete_expired',pending_plan=NULL,pending_interval=NULL,updated_at=NOW() WHERE firebase_uid=$1",[object.client_reference_id]);
    } else if (["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)) {
      await persistSubscription(object);
    } else if (event.type==="invoice.paid" || event.type==="invoice.payment_failed") {
      const subId=typeof object.subscription==="string"?object.subscription:object.subscription?.id;
      if (subId) {
        const subscription=await stripe().subscriptions.retrieve(subId);
        await persistSubscription(subscription);
        if (event.type==="invoice.payment_failed") {
          await db.query("UPDATE users SET subscription_status='past_due',updated_at=NOW() WHERE stripe_subscription_id=$1",[subId]);
        }
      }
    }
    await db.query("INSERT INTO stripe_webhook_events(stripe_event_id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING",[event.id,event.type]);
    return sendJson(res,200,{received:true});
  } catch(error) {
    console.error("Stripe webhook processing failed:",error.message);
    return sendJson(res,500,{error:"Webhook processing failed. Stripe can retry this event."});
  }
}
