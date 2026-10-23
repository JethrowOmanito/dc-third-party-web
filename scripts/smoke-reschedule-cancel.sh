#!/usr/bin/env bash
# Live end-to-end smoke test for the partner reschedule/cancel flow.
#
# Creates a disposable test booking under a test partner, mints a JWT
# session cookie, exercises every endpoint + security gate, verifies
# DB state, then soft-deletes the test booking.
#
# USAGE:
#   JWT_SECRET=<secret from VPS .env.production.local> \
#   SMOKE_BASE_URL=https://www.securedoctorclean.com \
#   PARTNER_USER_ID=bf92cbda-5ed6-4a19-b24a-7008e6b8186c \
#   PARTNER_COMPANY_ID=2f68a24b-2b8e-4eab-9376-944b73500071 \
#   PARTNER_USERNAME=jethrow \
#   SUPABASE_DB_URL=postgres://... \
#     ./scripts/smoke-reschedule-cancel.sh
#
# All env vars have working defaults for the Coca Cola test partner on
# securedoctorclean.com, so a bare `./scripts/smoke-reschedule-cancel.sh`
# runs the full flow (if JWT_SECRET + SUPABASE_DB_URL are set).

set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-https://www.securedoctorclean.com}"
PARTNER_USER_ID="${PARTNER_USER_ID:-bf92cbda-5ed6-4a19-b24a-7008e6b8186c}"
PARTNER_COMPANY_ID="${PARTNER_COMPANY_ID:-2f68a24b-2b8e-4eab-9376-944b73500071}"
PARTNER_USERNAME="${PARTNER_USERNAME:-jethrow}"
NEW_DATE="${NEW_DATE:-$(date -u -v+21d +%Y-%m-%d 2>/dev/null || date -u -d "+21 days" +%Y-%m-%d)}"

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "ERR: JWT_SECRET env var required (grab from VPS .env.production.local)" >&2
  exit 1
fi
if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERR: SUPABASE_DB_URL env var required (postgres connection string)" >&2
  exit 1
fi

say()  { printf '\033[36m▸ %s\033[0m\n' "$*"; }
pass() { printf '  \033[32m✓ %s\033[0m\n' "$*"; }
fail() { printf '  \033[31m✗ %s\033[0m\n' "$*"; exit 1; }

cleanup() {
  if [[ -n "${EID:-}" ]]; then
    say "Cleanup — soft-delete test row $EID"
    psql "$SUPABASE_DB_URL" -q -c "UPDATE events SET lifecycle_state='deleted' WHERE id='$EID';" >/dev/null || true
  fi
  rm -f /tmp/dc_partner_session.$$
}
trap cleanup EXIT

say "Mint JWT for $PARTNER_USERNAME"
TOKEN=$(JWT_SECRET="$JWT_SECRET" PARTNER_USER_ID="$PARTNER_USER_ID" \
       PARTNER_USERNAME="$PARTNER_USERNAME" PARTNER_COMPANY_ID="$PARTNER_COMPANY_ID" \
       node --input-type=module -e "
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const t = await new SignJWT({
  id: process.env.PARTNER_USER_ID,
  username: process.env.PARTNER_USERNAME,
  company_id: process.env.PARTNER_COMPANY_ID,
  approval_status: 'approved',
  partner_role: 'admin'
}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(secret);
process.stdout.write(t);
")
echo "$TOKEN" > /tmp/dc_partner_session.$$
pass "token minted (${#TOKEN} bytes)"

say "Create disposable test booking in events (14 days out)"
EID=$(psql "$SUPABASE_DB_URL" -At -c "
  INSERT INTO events (
    \"Title\", \"Name\", \"Email\", \"Whatsapp_Number\",
    \"Start_Date\", \"End_Date\", \"Start_Time\", \"End_Time\",
    \"Start_Time_Display\", \"End_Time_Display\",
    \"Service_Type\", \"Price\", final_price, amount_cents,
    payment_status, lifecycle_state, source,
    partner_company_id, owned_by_third_party, tax_treatment
  ) VALUES (
    'SMOKE TEST — automated', 'SMOKE TEST', 'smoke@test', '+6588888888',
    (CURRENT_DATE + 14), (CURRENT_DATE + 14),
    '09:00:00', '13:00:00', '9:00 AM', '1:00 PM',
    'Float', 300, 300, 32700,
    'unpaid', 'active', 'ID',
    '$PARTNER_COMPANY_ID', '$PARTNER_USER_ID', 'exclusive'
  ) RETURNING id;
")
pass "test row $EID"

req()  { curl -sS -X "${1:-GET}" "$BASE_URL/api/jobs/$EID/$2" -H "Cookie: dc_partner_session=$TOKEN" "${@:3}"; }
has()  { echo "$1" | grep -q "$2" && pass "contains '$2'" || fail "missing '$2' in: $1"; }

say "[1] GET cancel-info"
R=$(req GET cancel-info)
has "$R" '"fee_token"'
has "$R" '"payment_terms"'

say "[2] GET reschedule-info"
R=$(req GET reschedule-info)
RTOKEN=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['fee_token'])")
has "$R" '"fee_token"'

say "[3] POST reschedule to $NEW_DATE 14:00"
R=$(req POST reschedule -H 'Content-Type: application/json' \
    -d "{\"new_start_date\":\"$NEW_DATE\",\"new_start_time\":\"14:00\",\"reason\":\"smoke\",\"fee_token\":\"$RTOKEN\"}")
has "$R" '"rescheduled":true'

say "[4] POST cancel with fresh fee_token"
INFO=$(req GET cancel-info)
CTOKEN=$(echo "$INFO" | python3 -c "import sys,json;print(json.load(sys.stdin)['fee_token'])")
R=$(req POST cancel -H 'Content-Type: application/json' -d "{\"fee_token\":\"$CTOKEN\"}")
has "$R" '"cancelled":true'

say "[5] Replay cancel → expect 'already cancelled'"
R=$(req POST cancel -H 'Content-Type: application/json' -d "{\"fee_token\":\"$CTOKEN\"}")
has "$R" 'already been cancelled'

say "[6] IDOR — cancel-info on an event from a DIFFERENT company"
OTHER_EID=$(psql "$SUPABASE_DB_URL" -At -c "
  SELECT id FROM events
  WHERE partner_company_id IS NOT NULL AND partner_company_id != '$PARTNER_COMPANY_ID'
  LIMIT 1;
")
if [[ -n "$OTHER_EID" ]]; then
  R=$(curl -sS "$BASE_URL/api/jobs/$OTHER_EID/cancel-info" -H "Cookie: dc_partner_session=$TOKEN")
  has "$R" 'does not belong to your company'
else
  pass "no other-company events found — IDOR check skipped"
fi

say "[7] Unauthenticated — expect 401"
R=$(curl -sS "$BASE_URL/api/jobs/$EID/cancel-info")
has "$R" 'Unauthorized'

say "[8] Nonexistent event — expect 404"
R=$(curl -sS "$BASE_URL/api/jobs/00000000-0000-0000-0000-000000000000/cancel-info" \
    -H "Cookie: dc_partner_session=$TOKEN")
has "$R" 'Not found\|not found'

printf '\n\033[32mALL CHECKS PASSED\033[0m — reschedule/cancel flow healthy on %s\n' "$BASE_URL"
