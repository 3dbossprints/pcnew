# Piano Coach frontend rebuild

## Goal
Replace the demonstration UI with a premium, production-connected learning application. Preserve the existing Firebase, Neon, Cloudflare R2, Stripe and Vercel infrastructure. Production must not be modified until a reviewed merge.

## Product navigation
Exactly three primary destinations:
- Home Page (Dashboard)
- Practice
- Profile

Pro Extras live inside the Pieces area of the dashboard/learning workflow. No Assistant and no separate Extras or Sheet Music navigation item.

## Frontend principles
- No sample metrics, fictional lesson names, fake activity, fake success messages or nonfunctional controls.
- Empty states must say when there is no saved data.
- Every action must either call a real backend operation or be visibly disabled with an explanation.
- Keep the existing warm cream / sage palette and editorial typography, but introduce a more distinctive spatial design system, restrained motion, layered surfaces and responsive layouts.
- Honour prefers-reduced-motion and keyboard accessibility.
- Motion should clarify navigation, focus and state transitions rather than obstruct practice.

## Existing backend to reuse
- Firebase Authentication: `src/AuthGate.jsx`, `src/lib/firebase.js`
- Onboarding and Stripe embedded checkout: `src/OnboardingGate.jsx`, `api/billing/[action].js`
- Neon account profile: `api/me.js`, `api/profile.js`
- R2 signed uploads: `api/uploads/sign.js`, `api/uploads/complete.js`, `api/uploads/index.js`
- Practice session start/finish: `api/practice/start.js`, `api/practice/finish.js`

## Original piano-coach repository: reusable candidates
- `src/KeystoneLearnEngine.jsx` and `src/keystone-engine.js`: MusicXML parsing, measure timeline, falling-note/keyboard practice. Must be tested against current product requirements before adoption.
- `src/audio-to-score.js`, `src/audio-separation.js`, `src/audio-midi-encode.js`: browser-side polyphonic audio transcription and optional dialogue/music separation. The original implementation includes 8-minute / 100 MB limits and GPU-to-WASM fallback; it also documents memory constraints on lower-memory devices. Reuse selectively and add lifecycle/memory tests.
- `omr/runner.py`, `omr/onnxruntime.py`, `scripts/prepare-omr.sh`: HOMR browser OMR bridge. The original repo's `OMR-LICENSES.md` states that the adapted HOMR/Partsong integration is AGPL-3.0-or-later. Do not copy or redistribute these files into the proprietary app without a deliberate AGPL compliance decision. HOMR upstream is AGPL-3.0; evaluate deployment/licensing obligations before using it commercially.
- Original repo's `AUDIVERIS.md` describes Audiveris as unavailable in the static browser build; do not treat its presence as a working browser converter.

## Document handling
- Student-owned PDF and EPUB files are private R2 objects and must only be accessed through authenticated, short-lived signed operations.
- Password-protected PDFs may be opened only when the student supplies the password; never attempt to bypass encryption.
- DRM-protected EPUB restrictions must not be bypassed. Accept authorised DRM-free files.
- Keep originals unchanged. Conversion creates a separate derived file and records format, source ID, conversion state and errors.
- Validate actual file signatures and size server-side; do not trust MIME labels alone.
- Current R2 upload endpoints accept PDF, images, MusicXML, MIDI and audio but do not yet accept EPUB. This must be extended deliberately and with ZIP-bomb / archive-entry limits before EPUB support is enabled.

## Vercel constraints
The Hobby deployment limit is 12 serverless functions and the current app already uses the available slots. Extend existing route handlers or consolidate routes; do not add a new API file for each feature.

## Delivery sequence
1. Replace fake dashboard/profile data with authenticated data and honest empty states.
2. Finish profile persistence, password management, Stripe portal, and account deletion lifecycle.
3. Implement syllabus and personal-piece access rules, including Pro Extras.
4. Build actual Standard and Assisted Practice using validated MusicXML/score timelines.
5. Add recording, mistake feedback, history and progress calculations.
6. Add secure document conversion and OMR/audio-analysis integration after licence, accuracy, memory and security review.
7. Add premium motion polish and run end-to-end tests before merge.
