# Arcstone HRMS — Mobile App Build & Release Guide

This guide takes you from "I just signed up for Expo" to "I have a real APK
on my Android phone with full geofenced check-in + background location
tracking" in **30 minutes**.

---

## 0. What you've already got

The app code is complete in `/app/mobile/`:

- **Login** → JWT auth against the existing FastAPI backend
- **Home** → bootstrap dashboard
- **Attendance** → selfie + geofenced check-in/out, background location tracking foreground service
- **Leave** → list + apply
- **Approvals** (manager+) → approve/reject pending items
- **Profile** → me + logout
- **Push notifications** → Expo push token auto-registered on login

Backend has been wired with these mobile-only endpoints:
`POST /api/mobile/checkin`, `/checkout`, `/locations/ping`,
`GET /api/mobile/me`, `/locations/me`, `/locations/team`,
`POST /api/mobile/push-token`, `/visit`.

---

## 1. Install the EAS CLI on your laptop (one-time)

```bash
npm install -g eas-cli
```

Then log in with the Expo account you just created:

```bash
eas login
# enter the email + password you used to register on expo.dev
```

Verify:

```bash
eas whoami
# should print your username
```

---

## 2. Initialize the EAS project (one-time)

From a terminal **on your laptop**, copy the `/app/mobile` folder out of the
sandbox, or `git clone` the repo, then:

```bash
cd mobile
yarn install                       # install JS deps
eas init                           # creates an EAS project, prompts you to confirm
# (this auto-fills the projectId in app.json under expo.extra.eas.projectId)
```

> If `eas init` complains, just run `eas project:init --non-interactive`.

---

## 3. Configure the API base URL

The mobile app talks to the production backend. Open `app.json` and confirm:

```json
"extra": {
  "apiBaseUrl": "https://your-prod-domain.com",
  "eas": { "projectId": "..." }
}
```

For testing against Hetzner directly, use:
```json
"apiBaseUrl": "http://138.199.146.191"
```

For your live app, switch to a real domain with HTTPS (Android 9+ blocks
plain HTTP by default).

---

## 4. Build the APK

```bash
eas build --profile preview --platform android
```

This:
1. Uploads your code to EAS cloud
2. Provisions a build worker (~30 s queue + ~10 min build)
3. Signs the APK with an EAS-managed keystore
4. Returns a downloadable URL like `https://expo.dev/artifacts/eas/.../build.apk`

While the build runs, you can watch progress on https://expo.dev/builds.

When done, you'll see:
```
✔ Build finished
🤖 Android APK: https://expo.dev/artifacts/eas/abc123.apk
```

---

## 5. Distribute the APK

### Option A — direct hosted download from your Hetzner box

Copy the APK to the production server so the home page **Download APK** button works:

```bash
scp build.apk root@138.199.146.191:/opt/arcstone/static/mobile/arcstone-hrms.apk
mkdir -p /opt/arcstone/static/mobile  # if it doesn't exist yet
```

Restart backend so the public endpoint sees the new file:
```bash
ssh root@138.199.146.191 "supervisorctl restart arcstone-backend"
```

The home-page **Download APK** + QR code will now serve a real APK.

### Option B — EAS internal distribution

Open the EAS build URL on the Android phone → tap **Install**.

### Option C — Google Play (when ready)

```bash
eas build --profile production --platform android   # produces .aab
eas submit --platform android                       # uploads to Play Console
```

---

## 6. Permissions the user will see (Android 14+)

On first launch:
1. **Notifications** — for push approvals + lifecycle alerts.
2. **Camera** — only requested when checking in.
3. **Location → While using the app** — requested before first check-in.
4. **Location → Allow all the time** — requested separately by Android 12+.
   Without this, tracking pauses when the screen is off.
5. **Foreground service notification** — Android shows a persistent
   notification while tracking; this is **required by policy** and
   reassures employees they're being tracked transparently.

The privacy footer in `AttendanceScreen.js` explicitly tells employees
**"Location is only tracked between check-in and check-out"**.

---

## 7. iOS later

When you're ready for iOS:

```bash
eas build --profile preview --platform ios
```

Requires:
- An Apple Developer account ($99/yr)
- The bundle ID `io.arcstone.hrms` (already set in app.json)
- TestFlight will give you internal-only distribution

The same code runs on iOS — Background Location uses CLLocationManager
under the hood, but you've already added the necessary `infoPlist` keys.

---

## 8. Updating the app after release

For JS-only changes (UI tweaks, copy edits, business logic):
```bash
eas update --branch preview --message "fix: payslip layout"
```
Users get the update silently on next app launch — no Play Store re-review.

For native changes (new permissions, new SDK version):
```bash
eas build --profile production --platform android
eas submit --platform android
```

---

## Troubleshooting

**"Tracking stopped after 5 min":** Android Doze mode. Make sure the user
selected "Allow all the time" for Location, and that the foreground
service notification is visible.

**"Check-in failed: 403 you are 5 km away":** the work_site lat/long
configured by HR is wrong, or the user is genuinely off-site. HR should
verify in the admin panel → Attendance → Work sites.

**"Push notifications never arrive":** Expo push tokens require the
`projectId` in app.json to match the EAS project. Re-run `eas init`.

---

Built with ❤️ on Expo SDK 51 + React Native 0.74 + FastAPI.
