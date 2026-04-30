#!/usr/bin/env bash
# /opt/arcstone/scripts/mongo-backup.sh
#
# Daily MongoDB backup for Arcstone HRMS.
# - Runs as a root cron every night at 02:15 IST (20:45 UTC)
# - Uses `mongodump` to snapshot the `hrms_saas` DB into /opt/arcstone/backups/
# - Retains the last 30 daily backups (GDPR-safe, compressed, timestamped)
# - Emits a log line so `tail -f /var/log/arcstone-backup.log` always tells you
#   when the last successful backup happened.
#
# Optional off-box copy: if HETZNER_STORAGE_USER env is set, rsync the tarball
# to the configured Hetzner Storage Box. See /etc/default/arcstone-backup.
#
# Install:
#   sudo cp mongo-backup.sh /opt/arcstone/scripts/
#   sudo chmod +x /opt/arcstone/scripts/mongo-backup.sh
#   sudo crontab -l | { cat; echo '15 20 * * * /opt/arcstone/scripts/mongo-backup.sh >> /var/log/arcstone-backup.log 2>&1'; } | sudo crontab -
set -euo pipefail

# --- Config ---------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-/opt/arcstone/backups}"
DB_NAME="${DB_NAME:-hrms_saas}"
MONGO_URL="${MONGO_URL:-mongodb://localhost:27017}"
KEEP_DAYS="${KEEP_DAYS:-30}"
# Source optional overrides + off-box shipping creds
[ -f /etc/default/arcstone-backup ] && source /etc/default/arcstone-backup

STAMP=$(date -u +%Y%m%d-%H%M%S)
OUTDIR="${BACKUP_DIR}/${STAMP}"
TARBALL="${BACKUP_DIR}/arcstone-${DB_NAME}-${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -u +%FT%TZ)] backup start db=$DB_NAME out=$OUTDIR"

# --- Dump ----------------------------------------------------------------
mongodump --uri="$MONGO_URL" --db="$DB_NAME" --out="$OUTDIR" --quiet
tar -C "$BACKUP_DIR" -czf "$TARBALL" "$STAMP"
rm -rf "$OUTDIR"

# Integrity check
if ! tar -tzf "$TARBALL" > /dev/null 2>&1; then
    echo "[$(date -u +%FT%TZ)] FATAL: tarball integrity check failed for $TARBALL"
    exit 2
fi

SIZE_MB=$(du -m "$TARBALL" | cut -f1)
echo "[$(date -u +%FT%TZ)] backup ok size=${SIZE_MB}MB file=$TARBALL"

# --- Retention ------------------------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -name "arcstone-${DB_NAME}-*.tar.gz" -mtime +${KEEP_DAYS} -print -delete || true

# --- Off-box copy (optional) ---------------------------------------------
# Set these in /etc/default/arcstone-backup:
#   HETZNER_STORAGE_USER=u123456
#   HETZNER_STORAGE_HOST=u123456.your-storagebox.de
#   HETZNER_STORAGE_SSH_KEY=/root/.ssh/storagebox_ed25519
if [ -n "${HETZNER_STORAGE_USER:-}" ] && [ -n "${HETZNER_STORAGE_HOST:-}" ]; then
    echo "[$(date -u +%FT%TZ)] shipping to Hetzner Storage Box ${HETZNER_STORAGE_HOST}"
    rsync -az -e "ssh -i ${HETZNER_STORAGE_SSH_KEY:-/root/.ssh/id_ed25519} -o StrictHostKeyChecking=no -p 23" \
        "$TARBALL" \
        "${HETZNER_STORAGE_USER}@${HETZNER_STORAGE_HOST}:./arcstone-backups/" \
        && echo "[$(date -u +%FT%TZ)] off-box copy ok" \
        || echo "[$(date -u +%FT%TZ)] WARN: off-box copy failed — local copy is still safe"
fi

echo "[$(date -u +%FT%TZ)] backup done"
