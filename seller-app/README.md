# seller-app — YieldnYarn seller app (Android)

Kotlin/Jetpack Compose app for sellers: list produce (offline-first), get it graded, and
handle buyers' bids. Implements `implementation_plan.md` §8 against the Django API.

## Modules

| Module | What | Builds without Android SDK |
|---|---|---|
| `core/` | Retrofit API client with JWT refresh, the offline **sync engine**, listing validation, bid rules, formatting | ✅ plain Kotlin/JVM |
| `app/` | Compose UI, Hilt DI, Room (offline drafts + listing cache), WorkManager sync, FCM push | needs the Android SDK |

Keeping the networking and sync logic in `core` means it's unit-tested on the JVM with
`MockWebServer` (`./gradlew :core:test`), and the Android layer is thin glue.

## Screens (§8.2)

Login / Register (SELLER role enforced) · Dashboard (quick stats, sync status, recent updates)
· My Listings (Draft / Pending / Live / Sold filters) · Create Listing (5 steps: category →
commodity → quantity & price with live market price → camera/gallery photos → review) ·
Listing Detail (photos, AI/verifier grading, bids) · Bids (needs you / waiting on buyer /
closed, with accept, reject and counter-offer) · Notifications · Profile (name, phone,
English/Hindi, logout).

## Offline-first flow (§8.3)

1. A new listing is saved to Room first (`DRAFT_LOCAL`, shown as “Saved on phone”) with a
   client-generated `client_uuid`; photos are downscaled into app-private storage.
2. `SyncWorker` (WorkManager, network-constrained, exponential backoff, plus a 30-minute
   periodic safety net) runs `core`'s `SyncEngine`: create listing → upload each photo →
   trigger grading → fetch the server copy.
3. Every step is recorded, so an interrupted sync resumes where it stopped. Creation is
   idempotent on `client_uuid` (the backend returns the existing row on a replay), so a lost
   response can never create a duplicate listing.
4. Server wins: once synced, the draft and its local photos are deleted and the server's
   listing is cached. Network/5xx failures retry automatically; validation errors are marked
   “Couldn't upload” for the seller to retry or delete.

## Running it

1. Start the backends (see the repo root README). Django must be reachable from the phone.
2. Open `seller-app/` in Android Studio (it creates `local.properties` with your SDK path), or
   build from the command line with `ANDROID_HOME` set:

   ```bash
   cd seller-app
   ./gradlew :app:installDebug
   ```

3. Backend URLs come from `gradle.properties`. The defaults use `10.0.2.2`, the emulator's
   alias for your computer. On a physical phone on the same Wi-Fi, pass your PC's LAN IP:

   ```bash
   ./gradlew :app:installDebug \
     -PsellerApiUrl=http://192.168.1.20:8000/api/ \
     -PsellerComputeUrl=http://192.168.1.20:8001/compute/
   ```

   Run Django with `python manage.py runserver 0.0.0.0:8000` and add the IP to
   `DJANGO_ALLOWED_HOSTS`. Debug builds allow plain HTTP; release builds require HTTPS.

## Push notifications (optional)

The backend pushes every in-app notification via FCM when both sides are configured:

1. Create a Firebase project, add an Android app with package `com.msme.seller`, and put its
   `google-services.json` in `seller-app/app/` (gitignored). The build applies the
   google-services plugin only when that file exists, so the app builds and runs without it
   — push is simply off.
2. Download a service-account key for the same project and set
   `FIREBASE_CREDENTIALS_FILE=/path/to/key.json` in the repo's `.env` for Django.

The app registers its FCM token on login/rotation (`POST /api/notifications/devices/`) and
unregisters it on logout. Tapping a push opens the related listing or the Bids tab.

## Tests

```bash
./gradlew :core:test              # API client, token refresh, sync engine, validation, formatting
./gradlew :app:testDebugUnitTest  # app-level unit tests
```

CI (`.github/workflows/seller-app.yml`) runs both and builds the debug APK on every change
under `seller-app/`.
