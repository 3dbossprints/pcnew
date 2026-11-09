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

## Remaining before end-to-end upload testing

- Add the Firebase web API key.
- Add Firebase Admin service-account JSON.
- Add the bucket-scoped R2 S3 credentials.
- Apply the R2 CORS policy for the exact test origin.
- Redeploy after environment variables are added.
