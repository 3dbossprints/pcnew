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


## Book viewing and score-recognition service

The student library supports in-app PDF and EPUB viewing. PDF pages are rendered with PDF.js; password-protected PDFs prompt for a password supplied by the student. EPUB archives are rendered as paginated books, and embedded MP3/M4A/WAV/OGG assets are surfaced as audio references when present in the EPUB archive.

Score recognition is an asynchronous worker integration, not a Vercel function: OMR processing needs a dedicated CPU/memory worker for page layout analysis, notation recognition and audio-to-score alignment. The Vercel API creates owner-scoped jobs and sends a short-lived private R2 URL to the worker. The worker must POST results to `/api/uploads?callback=1` with the `x-omr-callback-secret` header.

Required server-only Vercel environment variables once the worker is deployed:
- `OMR_SERVICE_URL`: private or authenticated HTTPS base URL for the worker API.
- `OMR_SERVICE_TOKEN`: bearer token used when enqueueing jobs.
- `OMR_CALLBACK_SECRET`: shared secret used by the worker callback.
- `PUBLIC_APP_URL`: production app origin used to build the callback URL.

The app starts a job with authenticated `POST /api/uploads?analysis=1` and polls it with authenticated `GET /api/uploads?analysisJob=<job-id>`. The worker's `POST /jobs` contract receives `jobId`, `sourceUrl` (15-minute signed read URL), `originalName`, `contentType`, `documentType` and `callbackUrl`. It should return 2xx promptly and process asynchronously. Callback payloads use `{ jobId, status, result, error }`. For completed or reviewable results, `result.measures` must contain normalised page-relative rectangles: `[{ id, page, x, y, width, height, kind, label }]`, with x/y/width/height between 0 and 1. The worker should also return structured MusicXML/timing and audio-reference alignment data where available. Low-confidence recognition must use `needs_review`, not fabricate measure positions.

Apply `db/migrations/009_score_analysis_jobs.sql` and `db/migrations/010_practice_score_reference.sql` to Neon before enabling analysis and practice references. The OMR worker is not included or deployed by this frontend/API change; without its environment variables the app explicitly reports that score analysis is not connected.
