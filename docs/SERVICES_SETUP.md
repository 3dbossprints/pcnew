# Firebase, Neon and Cloudflare R2 setup

The current Piano Coach application uses Firebase Authentication for identity, Neon PostgreSQL for account/library metadata, and Cloudflare R2 for private file objects. PocketBase is not part of this architecture.

## Firebase web configuration

Set these Vercel project variables for Preview, Production and Development:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN=musiccoachuk.firebaseapp.com`
- `VITE_FIREBASE_PROJECT_ID=musiccoachuk`
- `VITE_FIREBASE_APP_ID=1:304887202384:web:1ad299bc3ec9f3bd9e4755`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=304887202384`

The Firebase web API key is public client configuration. Never put a Firebase Admin private key in a `VITE_*` variable.

## Firebase Admin

Set `FIREBASE_SERVICE_ACCOUNT_JSON` as a Sensitive Vercel environment variable. It must contain the service-account JSON for the same Firebase project. Keep it server-side only. Do not commit it or paste it into frontend code.

## Neon

Set `DATABASE_URL` as a Sensitive Vercel environment variable. The application connects to the `pianocoach` project's `neondb` database.

Schema migrations live in `db/migrations`. The initial account, preferences, practice and user-file tables were created earlier; migration 002 adds file-library metadata and indexes.

## Cloudflare R2

Create an R2 S3 API token restricted to the `piano-coach-files` bucket, with Object Read and Object Write permissions. Store the values as Sensitive Vercel variables:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME=piano-coach-files`

Do not expose these values to the browser. The browser receives only short-lived presigned upload/download URLs.

### R2 bucket CORS

The browser uploads directly to R2 using a presigned PUT URL. In Cloudflare Dashboard → R2 → `piano-coach-files` → Settings → CORS Policy, configure the production app origins. Example policy:

```json
[
  {
    "AllowedOrigins": [
      "https://pianocoach.cc.cd",
      "https://www.pianocoach.cc.cd",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "x-amz-*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add the exact Vercel preview origin temporarily when testing preview deployments. Avoid a public `*` origin for production.

## Current file-library flow

1. Authenticated browser requests a presigned upload URL from `POST /api/uploads/sign`.
2. Server records a pending row in Neon and returns a 5-minute presigned R2 PUT URL.
3. Browser uploads directly to R2.
4. Browser calls `POST /api/uploads/complete`; server checks the object in R2 and marks the row ready in Neon.
5. `GET /api/uploads` lists only the signed-in user's ready files.
6. `GET /api/uploads/download?id=...` returns a 3-minute owner-checked download URL.

Supported extensions: PDF, PNG, JPG/JPEG, XML/MusicXML, MID/MIDI, MP3, M4A, MP4, WEBM and WAV. Maximum upload size is 25 MB. This is private file storage; there is no public bucket URL in the app.

## End-to-end upload verification checklist

Before declaring uploads production-ready, verify that the current Vercel environment has:
- The Firebase web configuration for the same project.
- Firebase Admin service-account JSON as a server-only Sensitive variable.
- Bucket-scoped R2 S3 credentials as server-only Sensitive variables.
- The R2 CORS policy covering the exact production or preview origin.
- A successful sign-in, upload, completion, library listing, download and delete test.

The credentials are configured in Vercel by the project owner; this repository intentionally does not contain their values.


## Gmail SMTP (transactional email)

Configure these Vercel environment variables for Production, Preview and Development. Keep the password sensitive and server-side only:

- `GMAIL_HOST=smtp.gmail.com`
- `GMAIL_PORT=587`
- `GMAIL_SECURE=false`
- `GMAIL_USER=<the Gmail account used to authenticate SMTP>`
- `GMAIL_APP_PASSWORD` — a Google App Password (16 characters); never use your normal Google account password
- `GMAIL_FROM=Music Coach <noreply@musiccoach.cc.cd>`

Port 587 uses STARTTLS, so set `GMAIL_PORT=587` and `GMAIL_SECURE=false`. The sending Google account must have permission to send as `noreply@musiccoach.cc.cd` (for example, a verified Gmail “Send mail as” alias or Google Workspace mailbox). Domain ownership alone does not authorise Gmail to send as that address.

Server-side email code imports `sendEmail` from `api/_lib/email.js`. SMTP credentials must never be exposed in a `VITE_*` variable.


## Email verification and password recovery

The current auth API uses Firebase Authentication for identity, Neon for short-lived hashed codes/tokens, and Gmail SMTP for delivery.

- `POST /api/auth/email-code` — authenticated request for a six-digit email verification code.
- `POST /api/auth/verify-email-code` — authenticated code confirmation; verifies the Firebase user.
- `POST /api/auth/verify-email-link` — one-time link confirmation; does not require an existing sign-in.
- `POST /api/auth/password-reset` — sends a generic-response password reset email with both a six-digit code and a one-time app link.
- `POST /api/auth/password-reset-confirm` — accepts the code or the one-time app link token and updates the Firebase password.

Verification codes, verification links and reset links expire after five minutes. Resending verification replaces both the previous code and link. Codes are stored as SHA-256 hashes, allow at most five guesses, and requests are throttled per account (one per minute, five per rolling hour). Password-reset requests use the same generic response whether or not the email belongs to an account. Reset links are random one-time tokens stored only as hashes; they are not Firebase action links, so the five-minute expiry is enforced by the application.

Verification and reset links use `PUBLIC_APP_URL` if configured. Otherwise production uses `https://pianocoach.cc.cd`, while Vercel Preview deployments use their own `VERCEL_URL`. Set `PUBLIC_APP_URL` if the canonical production domain changes.

Neon migrations:
- `004_email_verification_codes.sql`
- `005_password_reset_codes.sql`

These migrations have been applied to the `pianocoach.neondb` database. Do not put verification codes, reset tokens, or passwords in application logs.


## Stripe subscriptions (test mode first)

The subscription API uses Stripe Checkout Embedded, Stripe Billing Customer Portal, and signed webhooks. The app does not grant paid access from a browser success screen; the verified webhook updates the user's plan in Neon.

Server-side environment variables:
- `STRIPE_SECRET_KEY` — test secret key in Vercel Preview/Development while testing; live key only after an explicit production launch decision.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the matching test or live webhook endpoint.
- `STRIPE_PRICE_BASIC_MONTHLY`
- `STRIPE_PRICE_BASIC_ANNUAL`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`

Client-side:
- `VITE_STRIPE_PUBLISHABLE_KEY` — matching test publishable key for Preview/Development; live publishable key only in Production after approval.

Create four recurring GBP prices in Stripe **test mode** before testing:
- Basic monthly: £9.99, every month.
- Basic annual: £109.89, every year.
- Pro monthly: £19.99, every month.
- Pro annual: £219.89, every year.

Annual amounts are charged upfront and equal eleven monthly payments. Do not create or copy live-mode prices as part of test setup. Put the resulting four `price_...` IDs into the matching Vercel environment variables. Never expose the secret key or webhook signing secret in a `VITE_` variable.

API:
- `POST /api/billing/checkout` — authenticated embedded Checkout session for Basic or Pro, monthly or annual.
- `POST /api/billing/portal` — authenticated Stripe Customer Portal session.
- `POST /api/billing/webhook` — verifies Stripe's signature and processes subscription events.

Configure the test-mode webhook endpoint to:
`https://<your-preview-domain>/api/billing/webhook`

Subscribe it to:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The webhook uses the raw request body for signature verification and stores processed event IDs in `stripe_webhook_events` for idempotency. Neon migration: `006_stripe_subscriptions.sql`. Pending onboarding fields are in `007_pending_checkout.sql`.

The Customer Portal must be activated/configured in Stripe Dashboard (test mode for testing) to permit subscription cancellation and payment-method updates. The intended cancellation behavior is cancel at period end; verify that option in the Portal configuration.

Tax collection is not enabled in the application at this stage. Stripe Tax/threshold monitoring must be configured only after confirming the merchant's VAT registration and tax obligations.

Important: the Stripe account currently connected to this ChatGPT session is visible as live mode only. No live Stripe products, prices, sessions or charges have been created. The code is ready to use test credentials supplied through Vercel, but test-mode Stripe calls cannot be made from this connected account until a test-mode account/context is available.
