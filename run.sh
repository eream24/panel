#!/bin/bash

# مسیرهای هاست - در صورت نیاز عوض کن
LOG_HOST_DIR="/var/docker/mosdns/log"          # همون مسیری که به مسدنس اضافه می‌کنیم
DATA_HOST_DIR="/var/docker/dns-panel/data"     # اینجا دیتابیس sqlite پرسیست میشه
ARCHIVE_HOST_DIR="/var/docker/dns-panel/log-archive" # لاگ‌های فشرده و آرشیوشده اینجا می‌مونن (هیچ‌وقت خودکار پاک نمیشن)

mkdir -p "$LOG_HOST_DIR" "$DATA_HOST_DIR" "$ARCHIVE_HOST_DIR"

# ---------------------------------------------------------------------------
# همگام‌سازی خودکار مخاطبین با پنل VPN (اختیاری).
# فقط یکی از دو بلوک زیر رو - در صورت نیاز - از حالت کامنت دربیار و به
# آرایه‌ی VPN_SYNC_ARGS زیر همین بلوک اضافه کن. اگر هیچ‌کدوم رو ست نکنی،
# این قابلیت خودکار غیرفعال می‌مونه و باید مخاطبین رو دستی اضافه کنی.
#
# گزینه‌ی الف) WGDashboard:
#   VPN_SYNC_ARGS=(
#     -e VPN_PANEL_TYPE=wgdashboard
#     -e VPN_PANEL_URL="http://172.20.20.1:10086"
#     -e VPN_PANEL_API_KEY="your-wgdashboard-api-key"
#     -e VPN_PANEL_INTERFACE="wg0"
#   )
#
# گزینه‌ی ب) wg-easy:
#   VPN_SYNC_ARGS=(
#     -e VPN_PANEL_TYPE=wg-easy
#     -e VPN_PANEL_URL="http://172.20.20.1:51821"
#     -e VPN_PANEL_USERNAME="admin"
#     -e VPN_PANEL_PASSWORD="your-wg-easy-admin-password"
#   )
# ---------------------------------------------------------------------------
VPN_SYNC_ARGS=()

docker stop dns-panel && docker rm -f dns-panel
docker image rm -f dns-panel

docker build -t dns-panel .

docker run -d \
  --restart=always \
  --name dns-panel \
  -p 8080:8080 \
  -v "$LOG_HOST_DIR":/var/log/mosdns \
  -v "$DATA_HOST_DIR":/data \
  -v "$ARCHIVE_HOST_DIR":/log-archive \
  -e RETENTION_DAYS=30 \
  -e LOG_MAX_SIZE_MB=200 \
  -e PANEL_USERNAME=admin \
  -e PANEL_PASSWORD="CHANGE_ME_PLEASE" \
  "${VPN_SYNC_ARGS[@]}" \
  dns-panel

exit 0
