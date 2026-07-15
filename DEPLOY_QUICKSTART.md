# Deploy to Hostinger VPS — Quick Start

You already cloned the repo onto your VPS. Now deploy it in 3 moves.

## Prerequisites
- A Hostinger **VPS** (Ubuntu 22.04/24.04 recommended) with root/SSH access.
- Your domain's **A record** pointing to the VPS IP (e.g. `techspider.site` → your VPS IP).
  Set this in hPanel → Domains → DNS, and wait for it to propagate.

## Step 1 — Edit two values in `deploy.sh`
Open `deploy.sh` (in the repo root) and set:
- `DOMAIN="techspider.site"`  → your real domain
- `ADMIN_PASSWORD="..."`      → a strong admin password (the script refuses to run until you change it)

(If you use **MongoDB Atlas** instead of a local DB, skip the Mongo install by editing the
`MONGO_URL` line in the generated `backend/.env` afterwards, or comment out the MongoDB block.)

## Step 2 — Run the script (from the repo root)
```bash
sudo bash deploy.sh
```
This installs everything (Python, Node/Yarn, Nginx, MongoDB, PM2, Certbot),
sets up the backend under PM2, builds the frontend, and configures Nginx.

## Step 3 — Enable HTTPS (required)
The script prints this at the end — run it once:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d techspider.site -d www.techspider.site
```
Geolocation (`Share Location`) only works over HTTPS, so this step is mandatory.

## You're live
- Public check-in:  `https://techspider.site`
- Admin dashboard:  `https://techspider.site/admin/login`

## Redeploying after code changes
```bash
cd /var/www/contractor-checkin
git pull
sudo bash deploy.sh   # rebuilds frontend + restarts backend
```

## Handy commands
```bash
pm2 logs cc-backend        # backend logs
pm2 restart cc-backend     # restart backend
sudo systemctl reload nginx
```

## Notes
- Secrets live in `backend/.env` (auto-generated `JWT_SECRET`). Never commit this file.
- The seeded admin password can be rotated by editing `ADMIN_PASSWORD` in `backend/.env`
  and running `pm2 restart cc-backend` (the app re-seeds/updates the hash on startup).
- Full manual reference (if you prefer step-by-step): see `DEPLOYMENT.md`.
