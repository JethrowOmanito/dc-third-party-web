# Deployment — READ THIS FIRST

**Production hosting: Hostinger VPS (as of 2026-08-27). NOT Vercel.**

Vercel project for `third-party-web` was deleted on 2026-08-27. Do NOT push to Vercel, do NOT run `vercel deploy`, do NOT recreate `vercel.json` or `.vercel/`.

## Production URLs

- **third-party-web** → https://www.securedoctorclean.com (this repo — partner portal, Stripe payments)
- **main-web** → https://www.securedoctorclean.org
- **booking-web** → https://doctorcleanpayment.sg (still on Vercel — do not touch)

## Deploy path

**Every push to `main` requires manual VPS sync until GitHub Actions is set up.**

Run this after pushing to sync production:

```bash
ssh root@187.52.126.97 "cd /home/deploy/apps/third-party-web && \
  sudo -u deploy git pull && \
  sudo -u deploy npm install --legacy-peer-deps --no-audit --no-fund && \
  sudo -u deploy env NODE_ENV=production npm run build && \
  sudo -u deploy pm2 reload third-party-web --update-env"
```

Then verify: `curl -sSI https://www.securedoctorclean.com/login`

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

- ❌ Push a `vercel.json` back into the repo
- ❌ Run `vercel deploy` or `vercel --prod`
- ❌ Add `@vercel/*` packages
- ❌ Add `.vercel/` directory
- ❌ Reference "Vercel" in code comments (grep confirms none exist as of 2026-08-27)

## If VPS is down / broken

No Vercel rollback available (project deleted). Options:
1. Hostinger weekly backup restore (~30 min RTO)
2. Redeploy to fresh VPS with these instructions
3. Check `/var/log/nginx/error.log` and `pm2 logs third-party-web`
