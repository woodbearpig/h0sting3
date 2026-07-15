#!/usr/bin/env bash
# =============================================================================
# Contractor Check-In — one-shot deploy script for a Hostinger Ubuntu VPS
# =============================================================================
# Usage (run from the cloned repo root, as root or with sudo):
#   sudo bash deploy.sh
#
# What it does:
#   1. Installs system deps (Python, Node/Yarn, Nginx, MongoDB, PM2, Certbot)
#   2. Sets up the FastAPI backend in a venv and starts it with PM2 (port 8001)
#   3. Builds the React frontend
#   4. Configures Nginx to serve the build + proxy /api -> backend
#   5. Prints the final Certbot command for HTTPS
#
# Edit the CONFIG block below before running.
# =============================================================================
set -euo pipefail

# ----------------------------- CONFIG ---------------------------------------
DOMAIN="techspider.site"                 # your domain (A record must point to this VPS)
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"  # repo root (this script's dir)
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
ADMIN_EMAIL="admin@techspider.site"      # seeded admin login email
ADMIN_PASSWORD="CHANGE_ME_STRONG_PASS"   # seeded admin login password — CHANGE THIS
DB_NAME="contractor_checkin"
# ----------------------------------------------------------------------------

log()  { echo -e "\n\033[1;32m==> $1\033[0m"; }
warn() { echo -e "\033[1;33m[!] $1\033[0m"; }

if [[ "$ADMIN_PASSWORD" == "CHANGE_ME_STRONG_PASS" ]]; then
  warn "Please edit ADMIN_PASSWORD in deploy.sh before running. Aborting."
  exit 1
fi

# ---------------------------------------------------------------------------
log "1/6 Installing system dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl gnupg ca-certificates lsb-release software-properties-common \
  python3 python3-venv python3-pip nginx

# Node 20 + Yarn
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v yarn >/dev/null 2>&1 || npm install -g yarn
command -v pm2  >/dev/null 2>&1 || npm install -g pm2

# MongoDB (Community 7.0). Skip this block if you use MongoDB Atlas instead.
if ! command -v mongod >/dev/null 2>&1; then
  log "Installing MongoDB 7.0"
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  UBU_CODENAME="$(lsb_release -cs)"
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${UBU_CODENAME}/mongodb-org/7.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -y
  apt-get install -y mongodb-org
  systemctl enable --now mongod
fi

# ---------------------------------------------------------------------------
log "2/6 Writing environment files"
JWT_SECRET="$(openssl rand -hex 32)"

cat > "$BACKEND_DIR/.env" <<EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="$DB_NAME"
CORS_ORIGINS="https://$DOMAIN"
JWT_SECRET="$JWT_SECRET"
ADMIN_EMAIL="$ADMIN_EMAIL"
ADMIN_PASSWORD="$ADMIN_PASSWORD"
EOF

cat > "$FRONTEND_DIR/.env" <<EOF
REACT_APP_BACKEND_URL=https://$DOMAIN
EOF

# ---------------------------------------------------------------------------
log "3/6 Setting up FastAPI backend (venv + PM2)"
cd "$BACKEND_DIR"
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

pm2 delete cc-backend >/dev/null 2>&1 || true
pm2 start "$BACKEND_DIR/venv/bin/uvicorn" --name cc-backend --cwd "$BACKEND_DIR" -- \
  server:app --host 0.0.0.0 --port 8001
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
log "4/6 Building React frontend"
cd "$FRONTEND_DIR"
yarn install --frozen-lockfile || yarn install
yarn build

# ---------------------------------------------------------------------------
log "5/6 Configuring Nginx"
cat > "/etc/nginx/sites-available/$DOMAIN" <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root $FRONTEND_DIR/build;
    index index.html;

    location / {
        try_files \$uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------------------
log "6/6 Done — backend running, frontend built, Nginx serving HTTP."
echo ""
echo "  Site (HTTP for now):  http://$DOMAIN"
echo "  Admin login:          http://$DOMAIN/admin/login"
echo "  Admin email:          $ADMIN_EMAIL"
echo ""
warn "FINAL STEP — enable HTTPS (required, geolocation needs it). Run:"
echo ""
echo "    sudo apt install -y certbot python3-certbot-nginx"
echo "    sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "Useful commands:"
echo "    pm2 logs cc-backend       # view backend logs"
echo "    pm2 restart cc-backend    # restart backend"
echo "    git pull && bash deploy.sh  # redeploy after code changes"
