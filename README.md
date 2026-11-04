# कामगार (Kaamgaar)

**डिजिटल कारीगर एवं मजदूर डायरेक्टरी** — an India-first marketplace where daily-wage workers and
employers find each other, and where everything from *काम पक्का* to *भुगतान* is a shared digital
record: two-sided Digital Hajri, automatic overtime, a wage ledger both parties see identically,
and two-way ratings.

Hindi-first UI. React 19 + TypeScript + Vite + Tailwind v4 on the front, **InsForge** for the entire
backend (auth, Postgres + RLS, storage, RPC business logic). No separate server, no Supabase.

---

## Running it

```bash
cp .env.example .env.local     # fill in base URL + anon key
npm install
npm run dev                    # http://localhost:5173
```

`.env.local` needs only the two **public** values:

```
VITE_INSFORGE_BASE_URL=https://<project>.<region>.insforge.app
VITE_INSFORGE_ANON_KEY=anon_...
```

Get the anon key with `npx -y @insforge/cli secrets get ANON_KEY`.
The **admin key never appears in the app** — it lives in `~/.secrets/insforge.env`, is read only by
the scripts in `scripts/`, and is git-ignored.

---

## लॉगिन — मोबाइल नंबर से

Users sign in with a **10-digit mobile number + password**. InsForge's auth layer only issues
identities against an email address (email+password, email OTP, OAuth — there is no phone identity
type), so the number is mapped deterministically onto a reserved internal alias:

```
9876543210  ->  919876543210@mobile.kaamgaar.app
```

The alias is never shown to users and never appears in an error message (`src/lib/phone.ts`,
plus a guard in `errMsg`). Because it is unique per number, **one mobile number = one account**.

The phone stored on the profile is derived **server-side from the signed-in identity**
(`mobile_from_alias()` inside `create_my_profile`), so a client cannot log in with one number and
claim another, and `profiles_protect()` blocks any later edit of `phone`/`email`.

Existing email accounts were migrated by `20260901122000_migrate_email_logins_to_mobile.sql`:
the address is rewritten to the alias, the **password hash is untouched**, so those users sign in
with their mobile number and the same password. Accounts with no valid Indian mobile on their
profile are skipped.

> **SMS OTP is not wired up.** It needs an SMS gateway (MSG91 / Twilio / Gupshup) plus a
> `send-otp` / `verify-otp` edge function; the project has no SMS provider and SMTP is disabled.

### Password reset

Because logins are mobile-number based (alias emails), InsForge's email reset cannot deliver a
code to anyone. Reset is therefore an **admin-mediated flow**
(`insforge/migrations/20260905120300_password_reset.sql`, fixed in `20260905130001`):

1. The user opens **Forgot password?** (below the login form, and `/forgot-password` directly),
   enters their 10-digit mobile, and taps **रीसेट रिक्वेस्ट करें**. A pending request row is
   created (rate-limited to 3 per user per 7 days; idempotent within 24 h). No existence oracle
   beyond the request itself is exposed.
2. The request page polls `get_password_reset_request` (request id is an unguessable bearer UUID
   kept only in the requester's `localStorage`) every 5 s.
3. An admin sees it under **Admin → 🔑 पासवर्ड रीसेट** and either approves or rejects (with an
   optional reason shown to the user). Approval sets a one-time 12-char temporary password via
   `crypt(pw, gen_salt('bf', 10))` — bcrypt, verified compatible with InsForge sign-in — and
   notifies the user.
4. The user's page shows the temporary password; logging in with it lands them on
   `/change-password?from=reset`, where `change_my_password` verifies the current password with
   `crypt()` against the stored hash, applies the platform policy (6+ chars, a digit, a
   lowercase letter), sets the new hash, and marks the request `consumed` so the temporary
   password stops working.
5. Any signed-in user can also change their password anytime from the profile page
   (🔒 पासवर्ड बदलें → `/change-password`).

Existing users are fully covered: the flow works off the stored `profiles.phone`, so accounts
created before this feature can reset too. All access to `password_reset_requests` goes through
`SECURITY DEFINER` functions (RLS on, no policies, no grants on the table).

## Backend

All schema, policies and business rules live in `insforge/migrations/*.sql` and are applied with:

```bash
bash scripts/apply-migration.sh insforge/migrations/20260901090100_core_schema.sql
```

| Migration | What it does |
|---|---|
| `20260901090100_core_schema` | 17 tables: profiles, worker/employer profiles, skills, worker_skills, worker_availability, jobs, applications, hires, attendance, payments, reviews, messages, notifications, disputes, portfolio, activity_flags |
| `20260901090200_business_logic` | attendance computation + append-only guard, payment/wage triggers, reputation aggregation, notification fan-out |
| `20260901090300_rpcs` | every write path that needs authorization: `apply_to_job`, `invite_worker`, `accept_application`, `mark_attendance`, `record_payment`, `submit_review`, `raise_dispute`, search + admin RPCs |
| `20260901090400_rls` | RLS enabled on every table, column-level grants, per-operation policies |
| `20260901090500_seed_skills` | the 20-trade catalogue (reference data, not demo data) |
| `20260901110000_mobile_auth` | mobile-number login: alias decoding, phone derived from the login identity, phone/email made immutable |
| `20260901122000_migrate_email_logins_to_mobile` | one-off: moves pre-existing email logins onto their mobile number |

Buckets: `avatars`, `portfolio`, `chat` (public) and `documents` (private, for ID proofs).

### Security model

* Every table has RLS on; `anon`/`authenticated` privileges are revoked and re-granted narrowly.
* `profiles.phone` is **not granted** to other users — the owner reads it through `get_my_profile()`.
* Attendance timestamps can only be written by `mark_attendance()` using the **server clock**; the
  table itself is read-only to both parties. A `BEFORE UPDATE` guard makes stamps append-only and
  side-owned, so no one can overwrite or forge the other side's IN/OUT.
* A worker can only accept invitations; an employer can only accept applications.
* Suspicious behaviour (application flooding) is written to `activity_flags` for review —
  **never an automatic ban**.
* Payments are a *record of a cash/UPI transfer that happened outside the app*. The UI says so; the
  app never claims to have moved money.

### The Hajri rule

```
confirmed_in  = LATER   of (worker_in,  employer_in)
confirmed_out = EARLIER of (worker_out, employer_out)
overtime      = max(0, confirmed_out − scheduled_out), capped at total hours
total_wage    = daily_wage + overtime_hours × overtime_rate
```

Only the period both sides agree on is paid. PRD example verified end-to-end:
8:00–18:00 shift, OUT at 19:15 → 1.25 h OT × ₹100 → ₹900 + ₹125 = **₹1,025**.

---

## Tests

```bash
set -a; source ~/.secrets/insforge.env; set +a
python3 scripts/e2e_test.py        # 65 backend assertions against the live project (incl. password reset)
node   scripts/ui_smoke.mjs        # 29 browser assertions, both journeys, writes screenshots/
node   scripts/ui_password_reset.mjs  # full reset journey: request → admin approves → temp pw → forced change
node   scripts/ui_role_test.mjs       # admin role management card (promote/demote via /admin/users)
node   scripts/ui_ratings_journey.mjs  # full journey: hire → haijri → both-side rating + work photo
node   scripts/chat_test.mjs       # 15 assertions for the floating chat, two users talking
node   scripts/pwa_test.mjs        # 25 PWA assertions (run against `npm run preview` or the live URL)
```

The e2e suite covers the full lifecycle plus the negative cases (worker can't post jobs, can't
self-accept, can't write the employer's timestamp, can't patch attendance directly, outsiders can't
read another pair's attendance/payments, `phone` is unreadable, non-admins get nothing from
`admin_stats`) and the mobile-login rules (client-supplied phone ignored, number not editable,
same number cannot register twice, wrong-password message never leaks the alias).

The password-reset section of the e2e suite covers the whole flow: request validation
(unknown / malformed number), no password leak while pending, non-admins can't list or
approve, admin approval produces a working 12-char temporary password, sign-in with it,
wrong-current / weak / same-password rejections, request consumed after the change, and the
temporary password stops working. `ui_password_reset.mjs` drives the same journey in a real
browser with two contexts (worker + promoted admin) and writes `screenshots/pwreset-*.png`.

All of these scripts create throwaway accounts and delete them again when the run finishes.

---

## PWA (फोन में ऐप की तरह)

The deployed site is an installable PWA — on Android, Chrome offers "Add to Home Screen" and the
app then opens standalone (no browser chrome), with the कामगार icon on the launcher.

* `public/manifest.webmanifest` — Hindi name, standalone display, cream theme, 192/512 icons plus
  **maskable** variants (Android crops icons to a circle), and three shortcuts (मैं उपलब्ध हूँ /
  हाजिरी / काम पोस्ट करें) available on long-press.
* `public/sw.js` — hand-written, deliberately narrow:
  * cross-origin (every InsForge call) and non-GET requests **bypass the cache entirely** —
    a worker must never see a stale हाजिरी, wage or payment;
  * navigations are network-first with the cached shell as fallback, so a deploy is picked up
    immediately;
  * `/assets/*` is cache-first (filenames are content-hashed);
  * `public/offline.html` is a Hindi dead-end page, only used when even the shell is missing.
* `src/lib/registerSW.ts` — registers in production only (the dev server must not be shadowed) and
  auto-reloads once when a new build takes over.
* `src/components/InstallPrompt.tsx` — Hindi "फोन में जोड़ें" card on both dashboards, driven by
  `beforeinstallprompt`; on iOS it shows the manual Share → Add to Home Screen hint. "अभी नहीं"
  snoozes it for 14 days.

Verify with `node scripts/pwa_test.mjs` (25 assertions: manifest, every icon byte-checked, head
tags, SW activation, real offline navigation, and that the SW cannot cache backend calls).

## Deploy

```bash
set -a; source ~/.secrets/insforge.env; set +a
python3 scripts/deploy.py
```

**Live: https://zrv4vvg9.insforge.site**

The script registers the build env vars, uploads app *source* (never `dist`, never `.env.local`),
starts the Vercel-backed build and polls until `READY`.

Two things that will bite you if you deploy by hand:

* `envVars` inside the deployment manifest is **not** enough — the build ignores them. They must be
  POSTed to `/api/deployments/env-vars` *before* `…/start`, which is why the script does that first.
* `vercel.json` with the SPA rewrite is required, otherwise every deep link (`/worker/hajri`, a
  refresh on any page) returns 404.

Only the two public `VITE_` values are sent to the build. The admin key is used solely to call the
deployment API and never reaches the bundle — verified after each deploy.

## Admin

There is no self-serve route to the admin role. Promote an existing account:

```bash
bash scripts/make-admin.sh you@example.com
```

Then log in normally — `/admin` unlocks (dashboard, users, jobs, attendance, payments, disputes,
verification).

---

## Structure

```
src/
  lib/insforge.ts     client + Hindi error normalisation
  lib/api.ts          the only place that talks to the backend
  lib/types.ts        row types
  lib/format.ts       ₹ / dates / hours / status labels
  lib/phone.ts        mobile normalisation, validation, alias mapping
  context/            auth + profile session
  components/         UI kit, layout (sidebar ⇄ bottom nav), Hajri, Ratings, Profile, RateModal
  pages/              landing, auth, onboarding, worker/*, employer/*, admin/*, chat
insforge/migrations/  the backend, versioned
scripts/              migration runner, admin promotion, e2e + UI tests
```

---

## 📱 Android App (Capacitor)

### Architecture
- **Package ID:** `app.kaamgaar.in`
- **App Name:** कामगार
- **Min Android:** API 23 (Android 6.0) — India ke 95%+ devices cover
- **Target SDK:** 35 (Android 15)
- **Same backend:** InsForge — koi nayi backend setup nahi
- **Auth:** Native platform pe `?client_type=mobile` REST auth use hoti hai; tokens Capacitor Preferences mein secure store hote hain
- **Web:** Cookie-based InsForge SDK session unchanged

### Build karne ke liye (baar pehle Android Studio setup)

**Prerequisites:**
1. [Android Studio](https://developer.android.com/studio) install karo
2. Android SDK API 35 aur Build Tools install karo (Studio Setup Wizard se)
3. Java 17+ (Android Studio ke saath aata hai)

**Steps:**
```bash
# 1. Web build karo
npm run build

# 2. Android project sync karo
npx cap sync android

# 3. Android Studio mein open karo
npx cap open android

# Ya directly command line se debug APK banao (Android SDK install hone ke baad):
cd android
./gradlew assembleDebug

# APK milega yahan:
# android/app/build/outputs/apk/debug/app-debug.apk
```

### `local.properties` update karo
`android/local.properties` mein apne machine ka Android SDK path set karo:
```
# Windows:
sdk.dir=C:\Users\YourName\AppData\Local\Android\Sdk

# Mac/Linux:
sdk.dir=/Users/YourName/Library/Android/sdk
```

### Play Store ke liye signed APK/AAB

```bash
# Release AAB (Play Store preferred format)
cd android
./gradlew bundleRelease

# AAB milega yahan:
# android/app/build/outputs/bundle/release/app-release.aab
```

Signing ke liye `android/app/build.gradle` mein `signingConfigs` add karo ya Android Studio ka
"Generate Signed Bundle" wizard use karo.

### Capacitor plugins (already installed)
| Plugin | Purpose |
|--------|---------|
| `@capacitor/app` | App lifecycle, back button |
| `@capacitor/preferences` | Secure token storage (auth) |
| `@capacitor/network` | Online/offline detection |
| `@capacitor/splash-screen` | Splash screen |
| `@capacitor/status-bar` | Status bar color/style |
| `@capacitor/camera` | Native camera fallback for the live-photo capture |
| `@capacitor/geolocation` | GPS location on the native app (handles Android runtime permission) |

### Dev mode (live reload Android emulator mein)
```bash
# 1. Local IP pata karo (ifconfig / ipconfig)
# 2. capacitor.config.ts mein server.url uncomment karo:
#    url: 'http://192.168.1.X:5173'
#    cleartext: true

# 3. Dev server chalu karo
npm run dev

# 4. Emulator/device pe chalao
npx cap run android
```

