# Deploying BumpLess

Single VPS, everything in Docker Compose (`db` + `backend` + `web`/Caddy).
Deploy is a local script that rsyncs the app to the VPS and rebuilds the stack.

## One-time setup
1. **DNS** — point the domain at the VPS: add an **A record** `@ → <VPS_IP>`
   for `bump-less.club` at your registrar (Spaceship). Needed before the first deploy
   so Caddy can obtain the certificate.
2. **SSH access** — you can `ssh root@<VPS_IP>` (key-based).
3. **Install Docker + Compose** (Ubuntu):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
   (includes the `docker compose` plugin)
4. **Open the firewall** for ports **80** and **443** (and 22). They must be reachable
   from the internet — Let's Encrypt validates the domain over port 80.
5. Make sure `frontend/.env` exists **locally** with your `VITE_MAPBOX_TOKEN`
   (the deploy script reads it and bakes it into the production build).

## Deploy
Set your VPS once in a local **`.deploy.env`** (gitignored — copy from `.deploy.env.example`):
```bash
echo 'VPS=root@<VPS_IP>' > .deploy.env
```
Then, from the repo root:
```bash
./deploy.sh
```
Override target if needed:
```bash
VPS=ubuntu@<VPS_IP> APP_DIR=/opt/bumpless ./deploy.sh
```
This rsyncs `road-sentinel-hk/` to the VPS and runs
`docker compose -f docker-compose.prod.yml up -d --build`.

### Deploy automatically on `git push` (optional)
Add a pre-push hook:
```bash
printf '#!/usr/bin/env bash\nexec ./deploy.sh\n' > .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

## Open it
- App: **https://bump-less.club/** (driver) and **/gov** (dashboard).
- Caddy automatically obtains a **Let's Encrypt** certificate — real, trusted HTTPS,
  no warnings. The first deploy takes ~30s while the cert is issued.

## Seed demo data (optional)
```bash
ssh root@<VPS_IP> 'cd /opt/bumpless && docker compose -f docker-compose.prod.yml exec backend uv run python seed.py'
```

## Notes
- Postgres data persists in the `bumpless_pgdata` volume across deploys.
- The self-signed CA persists in `caddy_data`, so the cert stays stable between deploys.
- TLS is automatic via Let's Encrypt (the Caddyfile serves the `bump-less.club` site).
  If the cert won't issue: confirm DNS resolves to the VPS and ports 80/443 are open.
