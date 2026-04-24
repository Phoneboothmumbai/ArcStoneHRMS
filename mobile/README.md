# Arcstone HRMS — Mobile (Expo)

React Native mobile app for the Arcstone HRMS SaaS. Built with Expo SDK 51. Uses the same backend at `REACT_APP_BACKEND_URL`.

## What's shipped (v0.1)

- **Login** with email/password; Face ID / Touch ID / fingerprint unlock helper (via `expo-local-authentication`).
- **Home** dashboard — pending leaves, days marked this month, manager approval queue counter, quick-actions.
- **Attendance** — geo-located check-in / check-out (via `expo-location`), last-7-days history.
- **Leave** — my balances, apply-leave modal with dynamic type picker, application history with status badges.
- **Approvals** (managers only, auto-shown for `branch_manager`/`sub_manager`/`assistant_manager`/`company_admin`) — approve / reject with one tap.
- **Profile** — completeness %, employee code, department, branch, manager, DOJ.

Features deferred to v0.2: push notifications (Expo Push), selfie capture, payslip view, Knowledge Base.

## Run it

```bash
cd /app/mobile

# 1) Install deps (already done in the sandbox)
yarn install

# 2) Start Metro + Expo dev server
npx expo start

# 3) Scan the QR code with Expo Go on your iPhone/Android device
#    (or press `i` for iOS simulator / `a` for Android emulator)
```

The app reads `apiBaseUrl` from `app.json → expo.extra.apiBaseUrl`. Update that URL when deploying against a different environment.

## Build native installers (optional)

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in (free Expo account)
eas login

# Configure — creates eas.json
eas build:configure

# Internal distribution (no store upload)
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

## Test accounts

All from the web app work on mobile:

| Role | Email | Password |
|------|-------|----------|
| Employee | `employee@acme.io` | `Employee@123` |
| Branch Manager | `manager@acme.io` | `Manager@123` |
| HR Admin | `hr@acme.io` | `Hr@12345` |

## Structure

```
mobile/
├── App.js                          # Entry (StatusBar + SafeAreaProvider + AppNavigator)
├── app.json                        # Expo manifest (perms, bundle IDs, apiBaseUrl)
├── babel.config.js
├── package.json
└── src/
    ├── context/AuthContext.js      # Token storage, login/logout, /auth/me
    ├── lib/
    │   ├── api.js                  # Axios instance + interceptors
    │   └── theme.js                # Colors / spacing / typography
    ├── navigation/AppNavigator.js  # Stack (Login ↔ Tabs) + Bottom tabs (with manager-only Approvals)
    └── screens/
        ├── LoginScreen.js
        ├── HomeScreen.js
        ├── AttendanceScreen.js
        ├── LeaveScreen.js
        ├── ApprovalsScreen.js
        └── ProfileScreen.js
```

## Known limitations

1. **Push notifications** — scaffolded in `app.json` (`expo-notifications` plugin) but the token registration + backend endpoint aren't wired yet. Coming in v0.2.
2. **Selfie on check-in** — permissions declared in `app.json`, but the capture flow will be added in v0.2 once we decide on storage (S3 vs base64).
3. **Payslip PDF** — depends on Phase 2B (payroll-run engine) to generate payslips server-side.
4. **Biometric fast-unlock** — currently only prompts for biometrics; full "re-use stored refresh token on biometric success" flow needs a short-lived local token vault. v0.2.
