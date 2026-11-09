# Piano Coach

A React + Vite music-learning platform for piano students, exam preparation and deliberate practice.

## Agreed infrastructure

- **Frontend and API:** Vercel (Vite frontend plus serverless Node API routes).
- **Database:** Neon PostgreSQL. Database access is server-side only through `DATABASE_URL`.
- **File storage:** Cloudflare R2 using short-lived, user-scoped presigned uploads.
- **Authentication:** Firebase Authentication (email/password and Google).
- **Email:** Gmail SMTP for future application notifications and custom verification workflows.
- **Payments:** Stripe; checkout, subscriptions and webhook processing are not yet implemented.

PocketBase is not part of the current architecture. Do not configure or deploy it for this project.

## Local development

Requires Node.js 20+.

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Environment variables

Copy `.env.example` to `.env.local` for local development. In Vercel, configure the equivalent values for the relevant environments.

Public Firebase web configuration uses the `VITE_FIREBASE_*` variables. The Firebase API key is a public web-app identifier; protect the project with Firebase Authentication, authorized domains and API restrictions.

The following are server-only secrets and must never use the `VITE_` prefix:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `DATABASE_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

Never commit real credentials or paste them into source files.

## Neon schema

The initial schema is in `database/schema.sql`. Review and apply it to the intended Neon project before using the account and upload API routes. This file has not been run against the live database automatically.

## API foundation

- `GET /api/me`: verifies a Firebase ID token, requires a verified email, and creates/returns the matching Neon user profile.
- `POST /api/uploads/sign`: verifies the user, validates file type/size and returns a five-minute R2 presigned upload URL. Uploads are scoped to the authenticated Firebase UID.

The API never exposes Neon or R2 credentials to the browser.

## Product scope and implementation status

The current frontend is an early visual foundation, not a production-ready product. Existing sample student details, grade content, practice timer, library entries and some controls are illustrative. The Firebase sign-in gate and the first secure Neon/R2 API routes have now been added on the development branch.

Still to implement and test before launch:

- The full verify-first email flow with a six-digit code and five-minute expiry, plus reset codes/links, delivered through Gmail SMTP. The current Firebase email/password screen is an interim baseline and does not yet implement that custom flow.
- Required onboarding and plan selection, including the one-hour lifetime demo.
- Persistent grade plans, pieces, exercises, scales, section-level progress and practice history.
- Real score conversion, library uploads/listing/downloads and Listen & Learn.
- Assisted and Standard practice, microphone/MIDI analysis, mistake recordings and linked feedback.
- Local Basic AI model download/cache/performance checks and Pro Kilo AI server proxy.
- Stripe checkout, billing portal, signed webhooks and renewal discount rules.
- Email and Web Push reminders, profile preferences, account deletion with a 15-day grace period, and admin authorization.
- Security review, automated tests, accessibility and production deployment verification.

Do not enable live billing or invite real students until the remaining integrations and security checks are complete.
