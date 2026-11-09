# Piano Coach — product and backend implementation plan

This document consolidates the decisions in the Outlook email **“Piano Coach — Latest Project Decisions & Remaining Plan”** (9 November 2026), the earlier **“Piano Coach – Complete Redesign Plan”** sent from the legacy iCloud address, and the decisions made in the planning conversation.

## Hosting and domains

- Frontend: Vercel at `musiccoach.cc.cd`.
- API/backend: self-hosted PocketBase at `data.musiccoach.cc.cd`.
- DNS and edge security: Cloudflare.
- PocketBase host: Oracle Cloud, smallest eligible Always Free VM, Ubuntu 24.04 LTS.
- Apply HTTPS, Cloudflare proxy/WAF/rate limits, restrictive origin firewall, SSH hardening, persistent storage and tested backups.
- PocketBase admin interface must not be publicly exposed.

## Authentication

- Email registration requires verification before account access. The email contains both a clickable verification link and a 6-digit code; the code is the fallback if the link cannot be used.
- Both verification methods expire after 5 minutes. Resends invalidate previous codes/links and are rate-limited.
- Password is set after successful email verification. Minimum 8 characters, upper- and lower-case letters and a number; special characters encouraged, not mandatory; check against commonly compromised passwords.
- Google and Microsoft OAuth sign-in are supported.
- If an OAuth-first user later chooses email sign-in, verify email with a 6-digit code and require them to set an email password; after that both sign-in methods remain available.
- Password recovery offers both a 6-digit code and a reset link, each expiring after 5 minutes.

## Profile and preferences

Keep Profile simple, in this order:
1. Name.
2. Preferred name.
3. Email and connected services.
4. Grade and exam board (for example, “Grade: 5 ABRSM Board”).
5. Target completion date.
6. Reminders and notation preferences: closer spacing with an expandable preview, larger noteheads, inverted notation.
7. Collapsible Interface Settings: high contrast, light, dark, larger font and accessibility controls.
8. Change password.
9. Account deletion.
10. Cancel subscription.

## Reminders

- Email via Gmail SMTP.
- Browser notifications via Web Push, service worker and VAPID.
- Flexible scheduling: individual days and multiple times per day.
- Email and browser reminders can be enabled independently.
- Use the student's local timezone.

## Account deletion

- Require password confirmation or identity verification.
- Explain the scope and consequences.
- 15-day grace period during which the user can sign back in and cancel deletion.
- After 15 days, permanently delete personal data, practice history, uploaded sheet music and recordings.
- Cancel an active subscription as part of the deletion workflow. Retain only legally required billing records where necessary.

## Plans and payments

Stripe handles Checkout, recurring billing, cancellation, receipts, customer portal and signed webhooks.

- Free: one lifetime hour (60 minutes total) of eligible demo/practice use across all sessions.
- Basic: £9.99/month; browser-based on-device AI; required exam-board e-book; agreed core features.
- Pro: £19.99/month; faster cloud AI through the Kilo AI API using the owner's key; everything in Basic plus Extras.
- BYOK was explicitly removed. Do not offer user API-key entry, Ollama or LM Studio.
- If a device does not meet local-AI requirements, warn before signup and offer Pro or leaving without registering.
- Every user earns a day streak after at least 15 minutes of practice.
- Pro users who practise every day for 30 consecutive days after renewal receive 10% off the next month.
- Admin discount generation: unique codes for selected users/email addresses and public codes. Further Admin capabilities are still to be designed.

## Exam-board e-books

- No Piano Coach-hosted e-book library and no admin-uploaded catalogue.
- Students may upload their own exam-board e-book, or follow a purchase link to an external retailer such as Amazon.
- Support affiliate tracking where available and disclose affiliate relationships.
- Importer targets EPUB, standard PDF and password-protected/encrypted PDFs when the user supplies the password and has legitimate access.
- Do not bypass DRM or access restrictions. DRM-protected EPUBs may require an authorised DRM-free copy.

## Local AI and device compatibility

- Basic AI runs in the browser on the student's device, using available CPU/GPU acceleration such as WebGPU.
- 6 GB RAM is the initial minimum, but also check browser/GPU support, available storage and an actual model performance test.
- Download and cache the local model during first-time setup. Do not redownload when it is already available in that browser. Resume interrupted downloads where possible.
- Pro uses Kilo AI cloud inference and does not need the Basic local model.
- Never expose the Kilo API key, Stripe secret, SMTP credentials or PocketBase admin credentials in frontend code or `VITE_*` variables.

## First-use loading experience

- After signup and plan selection/payment, show a 3-second circular loading animation.
- Follow with a branded interactive loading visualiser and rotating messages such as “Personalising your dashboard”, “Setting up your dashboard” and “Loading interface”.
- Show it on first use in a browser or when the local AI model is missing.
- Keep it visible for up to 90 seconds; if setup completes earlier, open the dashboard immediately. At 90 seconds, open the dashboard and continue remaining work in the background with a progress bar to 100%.
- Branding: warm cream background `#fff6eb`, primary brand colour and elegant flowing waves.
- Optional microphone input is processed locally, not recorded or uploaded. Loudness controls vertical wave amplitude; pitch maps low notes left and high notes right.
- Mouse movement creates small ripples; clicks create expanding ripples that travel to screen edges. Mouse interaction works even without microphone permission.

## Main student navigation

Preserve the previously agreed structure:
- Dashboard
- Practice
- Sheet Music
- Grade Plan
- Extras (Pro only)

Profile is a simple account page, not a primary navigation area. The Assistant belongs inside the Extras experience, not as another main navigation section. Do not add separate Progress or Assistant sidebar tabs.

## Core practice and learning requirements from the earlier redesign

- Students choose exam-board pieces and exercises, plus all scales required for their selected grade. Piano Coach builds the Grade Plan.
- Practice recommends a piece but lets the student decline and choose another.
- AI analyses the practice performance; after the session the student selects Done and receives feedback.
- Mistake recordings/feedback entries link to the corresponding score bars. Selecting a mistake scrolls and highlights the relevant bars; left/right arrows navigate to previous/next mistake areas. Users can still navigate anywhere on the score.
- Feedback highlights appear only on the AI Feedback page and expanded homepage piece view.
- Sheet Music includes converter and the student's own collection; no separate Library navigation section.
- Listen & Learn is enabled only when a suitable sheet-music upload exists (not a photo-only upload). Use falling-note keyboard learning, hand selection, duration-aware notes, microphone/MIDI feedback and keyboard octave fitting.
- Practice streak requirement remains 15 minutes for every user.

## Current implementation status

The first commit creates the React/Vite frontend shell and a visual dashboard preview with basic client-side navigation and demo interactions. The sample account, metrics, grade content, score preview, library entries, practice timer, settings, and discount generator are illustrative only. Authentication, PocketBase collections/rules, Stripe, mail delivery, Web Push, local model download/inference, Kilo API proxy, e-book parsing, score conversion, microphone/MIDI analysis, data persistence and production admin authorization are not yet implemented. Do not present this preview as production-ready or enable real billing until those integrations and security checks are complete.
