#!/usr/bin/env bash
#
# Build a fresh Android APK on EAS, then push the new artifact URL to the
# production server so the landing-page QR/button always serves the latest.
#
# Prerequisites:
#   - EXPO_TOKEN exported (write access to @phonebooth/arcstone-hrms)
#   - PROD_HOST + PROD_PASS exported (or override below)
#   - sshpass, eas-cli on PATH
#
# Usage:
#   EXPO_TOKEN=... ./scripts/release-apk.sh                # build + publish
#   EXPO_TOKEN=... ./scripts/release-apk.sh --reuse <id>   # only republish
#                                                          # an existing build
#   ./scripts/release-apk.sh --ota "fix copy"              # ship JS-only OTA
#                                                          # (no APK rebuild)
#
set -euo pipefail

PROD_HOST="${PROD_HOST:-138.199.146.191}"
PROD_USER="${PROD_USER:-root}"
PROD_PASS="${PROD_PASS:-}"
PROD_ENV="${PROD_ENV:-/opt/arcstone/backend/.env}"
PROD_SVC="${PROD_SVC:-arcstone-backend}"

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../mobile" && pwd)"
cd "$MOBILE_DIR"

ssh_run() {
  if [[ -n "$PROD_PASS" ]]; then
    SSHPASS="$PROD_PASS" sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$PROD_USER@$PROD_HOST" "$@"
  else
    ssh -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" "$@"
  fi
}

require_token() {
  if [[ -z "${EXPO_TOKEN:-}" ]]; then
    echo "✗ EXPO_TOKEN not set. Export it (https://expo.dev/accounts/.../settings/access-tokens) and retry." >&2
    exit 1
  fi
}

# ───── OTA-only mode (no APK rebuild) ────────────────────────────────────
if [[ "${1:-}" == "--ota" ]]; then
  shift
  require_token
  msg="${1:-feat: OTA update}"
  echo "▶ Publishing OTA update to channel 'preview' …"
  eas update --branch preview --message "$msg" --non-interactive
  echo "✓ OTA shipped. Devices fetch on next launch."
  exit 0
fi

# ───── APK build (or reuse) ──────────────────────────────────────────────
if [[ "${1:-}" == "--reuse" && -n "${2:-}" ]]; then
  BUILD_ID="$2"
  echo "▶ Reusing build $BUILD_ID"
else
  require_token
  echo "▶ Triggering fresh EAS build (preview / android) …"
  eas build --profile preview --platform android --non-interactive --no-wait \
    | tee /tmp/eas-build.log
  BUILD_ID="$(grep -oE 'projects/[^/]+/builds/[a-f0-9-]+' /tmp/eas-build.log | head -1 | awk -F/ '{print $NF}')"
  if [[ -z "$BUILD_ID" ]]; then
    echo "✗ Could not parse build ID from EAS output." >&2
    exit 1
  fi
  echo "▶ Build ID: $BUILD_ID — waiting for completion (~6-10 min) …"
  while :; do
    sleep 30
    STATUS_LINE="$(eas build:view "$BUILD_ID" 2>/dev/null | grep -E '^Status' || true)"
    case "$STATUS_LINE" in
      *finished*) break ;;
      *errored*|*canceled*)
        echo "✗ Build $BUILD_ID did not succeed: $STATUS_LINE" >&2
        exit 1 ;;
      *) echo "  …still building ($STATUS_LINE)" ;;
    esac
  done
fi

APK_URL="$(eas build:view "$BUILD_ID" 2>/dev/null | awk -F'  +' '/Application Archive URL/{print $2}' | tr -d ' ')"
APP_VER="$(eas build:view "$BUILD_ID" 2>/dev/null | awk -F'  +' '/^Version /{print $2}' | tr -d ' ')"
[[ -z "$APP_VER" ]] && APP_VER="$(node -p "require('./app.json').expo.version")"

if [[ -z "$APK_URL" ]]; then
  echo "✗ Couldn't read APK URL from build $BUILD_ID" >&2
  exit 1
fi

echo "✓ APK ready: $APK_URL"
echo "✓ Version : $APP_VER"

# ───── Push to production ────────────────────────────────────────────────
echo "▶ Updating $PROD_HOST:$PROD_ENV …"
ssh_run "set -e
cd \$(dirname $PROD_ENV)
sed -i.bak '/^MOBILE_APK_REMOTE_URL=/d; /^MOBILE_APP_VERSION=/d' $PROD_ENV
printf '%s\n' \\
  'MOBILE_APK_REMOTE_URL=\"$APK_URL\"' \\
  'MOBILE_APP_VERSION=\"$APP_VER\"' \\
  >> $PROD_ENV
echo --- after patch ---
tail -3 $PROD_ENV
echo --- restart ---
supervisorctl restart $PROD_SVC
sleep 3
curl -sS http://localhost:8001/api/public/mobile-app | python3 -c 'import sys,json;d=json.load(sys.stdin);print(\"version:\",d[\"version\"]);print(\"size:\",d[\"android\"][\"apk_size_mb\"])'"

echo
echo "✓ Production now serving APK $APP_VER ($APK_URL)"
echo "  Landing page: http://$PROD_HOST/  (#mobile-app)"
