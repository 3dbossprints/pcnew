# Piano Coach

Piano Coach is a React + Vite web application for piano students, exam preparation and deliberate practice.

## Stack

- React 18 + Vite 6
- PocketBase JavaScript SDK (backend endpoint configured with `VITE_POCKETBASE_URL`)
- Plain CSS design system
- Vercel-ready static frontend

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

## Deployment

Import this repository into Vercel. Use:
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

Set `VITE_POCKETBASE_URL=https://data.musiccoach.cc.cd` in the Vercel project environment once the PocketBase server is provisioned.

## Product decisions reflected in this foundation

- Main workspace: Dashboard, Practice, Sheet Music, Grade Plan and Pro-only Extras.
- Profile is an account page, not a separate primary navigation area.
- Free: one lifetime hour of eligible practice/demo time.
- Basic: £9.99/month with browser-based on-device AI.
- Pro: £19.99/month with Kilo AI-powered cloud processing and Extras.
- Every user earns a daily streak after at least 15 minutes of practice.
- Pro users can earn 10% off the next month after 30 consecutive practice days from renewal.
- Sheet Music includes the converter and the student's own collection. There is no hosted Piano Coach e-book library.
- Students upload their own exam-board e-book or follow an external retailer/affiliate purchase link.
- Account deletion has a 15-day cancellation window.

## Important implementation status

This repository currently contains the first frontend foundation and interactive UI preview. The visible sample student, grade data, practice timer, library items, plan details and admin discount-code preview are demo data/local interactions. They are not yet connected to PocketBase, Stripe, Gmail SMTP, Web Push, Kilo AI, real model downloads, exam-board content, or production authentication. Those services must be implemented and tested before real users or payments are enabled.

Do not add private API keys to frontend environment variables. Kilo AI credentials, Stripe secret keys, SMTP credentials and PocketBase admin credentials belong only in trusted server-side configuration.
