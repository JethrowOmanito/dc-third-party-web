# Deployment — READ THIS FIRST

**Production hosting: Hostinger VPS (as of 2026-08-27). NOT Vercel.**

Vercel auto-deploy for `dc-third-party-web` was disabled on 2026-08-27 via `vercel.json`'s `git.deploymentEnabled: false`. The Vercel project itself is kept alive as rollback insurance (frozen at last build). **Do NOT push to Vercel, do NOT run `vercel deploy`, do NOT remove or edit `vercel.json`.**

## Production URLs

- **third-party-web** → https://www.securedoctorclean.com (this repo — partner portal, Stripe payments)
- **main-web** → https://www.securedoctorclean.org
- **booking-web** → https://doctorcleanpayment.sg (still on Vercel — do not touch)

## Deploy path — TWO STEPS

**After every `git push origin main`:**

```bash
ssh root@187.52.126.97 dc-deploy third-party-web
```

That's it. The `dc-deploy` script on the VPS handles:
- git fetch + pull
- npm install (skipped if package.json unchanged — saves ~45s)
- production build
- pm2 reload (zero-downtime — in-flight requests survive)
- `.next.previous` backup for instant rollback
- automatic health check via `curl /login`

Typical duration: **30-90 seconds** depending on whether deps changed.

Logs at `/var/log/dc-deploy-third-party-web.log` on VPS.

## Instant rollback (if a deploy breaks something)

```bash
ssh root@187.52.126.97 dc-rollback third-party-web
```

- ~10 seconds total
- Swaps saved `.next.previous` back into place
- Reverts git to previous SHA
- pm2 reload
- Prompts for confirmation before executing
- Failed build kept at `.next.failed` for post-mortem

## VPS details

- **Host:** `187.52.126.97` (Hostinger KVM 2, Kuala Lumpur)
- **User:** `deploy` (non-root, sudo enabled), or `root` for admin ops
- **App dir:** `/home/deploy/apps/third-party-web`
- **pm2 names:** `third-party-web-1` (port 3001) + `third-party-web-2` (port 3011) — dual-instance behind nginx `least_conn` upstream
- **Env file:** `/home/deploy/apps/third-party-web/.env.production.local` (chmod 600)
- **Behind:** Cloudflare (Full strict SSL, `CF-Connecting-IP` trusted for real client IP) + UFW firewall (443 open to CF IPs only)
- **Redis:** localhost:6379 — rate limiter uses `REDIS_URL` (shared across both instances)
- **Debug token:** `/root/backups/tpw-debug-token.txt` on VPS — used by `/api/debug/heapdump?token=...`

## Stripe webhooks

Stripe webhook endpoint is `https://www.securedoctorclean.com/api/webhooks/stripe`. Nginx preserves raw body (`proxy_request_buffering off`) so Stripe signature validation works. `STRIPE_WEBHOOK_SECRET` env var must match Stripe dashboard.

## What NOT to do

- ❌ Push to Vercel — Vercel auto-deploy is disabled and project is frozen as rollback insurance
- ❌ Remove `vercel.json` — its `git.deploymentEnabled: false` is what keeps Vercel from wasting builds
- ❌ Run `vercel deploy` or `vercel --prod`
- ❌ Add `@vercel/*` packages
- ❌ Add `.vercel/` directory (untracked / gitignored)
- ❌ Reference "Vercel" in code comments (grep confirms none exist as of 2026-08-27)
- ❌ Bypass `dc-deploy` script — manual steps are error-prone

## If VPS is down / broken

- Rollback within VPS: `ssh root@187.52.126.97 dc-rollback third-party-web`
- Emergency Vercel fallback: change Cloudflare DNS A records for `securedoctorclean.com` back to `76.76.21.21` — Vercel serves the last-known-good frozen build in ~5 min
- Full disaster: Hostinger weekly backup restore (~30 min RTO)
- Debug: `/var/log/nginx/error.log`, `pm2 logs third-party-web-1`, `pm2 logs third-party-web-2`, or per-request routing in `/var/log/nginx/tpw-access.log` (includes `upstream=127.0.0.1:PORT`)

## Login defense (5 layers)

1. **Cloudflare** — always-on DDoS at network edge
2. **UFW** — port 443 open only to CF IP ranges
3. **nginx `limit_req`** — 10 req/min per IP on `/api/auth/login` (burst 5) → returns 429
4. **App limiter** — 5 attempts/15min per (ip, username) → returns 429; backed by Redis (shared across instances)
5. **fail2ban `tpw-login` jail** — 8 failures (401\|429) in 10 min → 1-hour UFW ban

## Memory-leak diagnosis

If a `third-party-web-*` instance grows past ~1.5 GB:

```bash
DEBUG_TOKEN=$(ssh root@187.52.126.97 cat /root/backups/tpw-debug-token.txt)
curl "https://www.securedoctorclean.com/api/debug/heapdump?token=$DEBUG_TOKEN"
# Response includes filepath — scp it and open in Chrome DevTools → Memory tab
```

Old dumps auto-cleaned nightly at 04:30 (`dc-cleanup-heapdumps`).
