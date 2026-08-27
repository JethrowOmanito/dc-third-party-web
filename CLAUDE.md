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
- **pm2 name:** `third-party-web` on port `3001`
- **Env file:** `/home/deploy/apps/third-party-web/.env.production.local` (chmod 600)
- **Behind:** Cloudflare (Full strict SSL) + UFW firewall (443 open to CF IPs only)

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
- Debug: `/var/log/nginx/error.log` and `pm2 logs third-party-web`
