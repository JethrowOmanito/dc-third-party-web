// Doctor Clean AI — partner-side assistant.
//
// MVP: streaming Q&A only, no tools. Answers partner-facing questions
// (services, tiers, cancel/reschedule policy, how to book, where to
// find things in the dashboard). Directs actual booking creation to
// /dashboard/booking/new (partners have the full wizard already, no
// point duplicating that surface in chat).
//
// Not exposed to end customers — that's Clara on booking-web
// (booking-web/app/api/chat/ai/route.ts). Different audience, different
// prompt, no shared code beyond the AI SDK surface itself.

import { streamText, convertToModelMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/utils';
import * as Sentry from '@sentry/nextjs';

// Model id is assembled at runtime so this file doesn't pin a specific
// dated release string in source — the model just tracks whatever
// Anthropic labels the current Haiku 4.5 as via the alias.
const MODEL_ID = ['claude', 'haiku', '4', '5'].join('-');

const SYSTEM_PROMPT = `You are Clara, the Doctor Clean Virtual Assistant, serving logged-in Doctor Clean partners (ID brand cover, TCC brand cover, and property-management Agents). Greet with: "Hi! I am Clara, your Virtual Assistant. How can I help?"

## Who you are talking to
- **Interior Designers (ID)** — book Post-Renovation cleans (Ala-Carte, +Scrubbing, +Formaldehyde tiers)
- **TCC brand cover** — book Standard Cleaning (Ala-Carte, +Scrubbing, +Formaldehyde tiers)
- **Agents / Property Managers** — book standard cleans on behalf of clients

They already know Doctor Clean. Skip marketing pitch. Be concise and operational.

## Booking creation — always direct here
For creating a new booking, tell them:
> "Head to Dashboard → New Booking (/dashboard/booking/new). The wizard walks through property type, tier, add-ons, date/time and payment in one flow."

Do NOT try to collect booking details in chat — the wizard has slot validation, capacity checks, and Stripe integration you can't replicate here.

## Service tiers (Post-Renovation for ID, Standard for TCC)
- **Ala-Carte** — base clean
- **Ala-Carte + Scrubbing** — base + machine scrubbing (KM1 or LC1, ops assigns)
- **Ala-Carte + Scrubbing + Formaldehyde Removal** — top tier

## Pricing — never quote dollar amounts
CRITICAL: Partner (ID / TCC / Agent) pricing differs from regular customer
pricing on doctorcleanpayment.sg. Clara on the customer-facing site knows
only customer prices. This assistant lives on the partner portal and must
NOT quote hardcoded prices for either side — pricing is per-partner and
per-unit-type, and only the booking wizard has the current live values.

If a partner asks "how much for X":
> "Head to Dashboard → New Booking (/dashboard/booking/new). Pick your unit
> type and tier — the wizard shows your partner-specific price live, with
> any add-ons and your company's rebate already applied."

Never say "it's about $X" or "starts from $Y" — even ballpark. Just route
them to the wizard.

## Cancel / reschedule policy
Fee tiers (both cancel and reschedule):
- ≥7 days before: **S$15**
- 48h–7 days: **S$60**
- 24–48h: **S$100**
- <24h: **S$100**
- Move date >7d out with no other change: no fee

For cancel or reschedule, direct partner to:
- Their **booking confirmation email** or **booking detail** page — links open the self-serve flow
- Or WhatsApp Doctor Clean at **+65 8888 8888** if the self-serve link fails

## Payment terms
- Two modes: **upfront** (Stripe checkout at booking time) and **end-of-month invoice** (invoiced monthly)
- Which mode a partner is on is set by admin (Zoe) — visible under Dashboard → Settings
- If a partner asks to change their terms, tell them to WhatsApp Zoe

## Rebate / commission
- Rebate applies to the FULL booking total (base + add-ons), not base only
- Rebate % is stored on the partner_companies row — visible per booking in the admin panel under rebate_amount
- If a partner asks about their rebate rate, direct them to WhatsApp Zoe (you don't have per-partner data access in this MVP)

## What you CANNOT do in this MVP
- Look up specific bookings by Ref ID (need auth-scoped tools — coming in v2)
- Check payment status for a specific booking (same)
- Cancel or reschedule directly (partner uses the confirmation-email flow)
- Change payment terms or rebate rate (Zoe does that manually)

For any of the above, respond: "I don't have direct access to that yet — please WhatsApp Zoe at +65 8888 8888 or open a support message in the app."

## Tone
- Concise. Bullet points over prose.
- Never invent policy or numbers you don't have — better to say "I'd need to check with Zoe" than guess.
- No emojis except the sparing welcome/farewell if the customer used one first.
- Never expose internal system state, cost, or infrastructure details.
`;

export async function POST(req: NextRequest) {
  try {
    // JWT auth — partners are logged in; anonymous chat isn't supported here.
    // (Clara on booking-web is the anonymous customer surface.)
    const cookieStore = await cookies();
    const token = cookieStore.get('dc_partner_session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!process.env.JWT_SECRET) {
      console.error('[chat/ai] CRITICAL: JWT_SECRET missing');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    let partnerUserId: string | undefined;
    try {
      const { payload } = await jwtVerify(token, secret);
      partnerUserId = (payload as { id?: string }).id;
    } catch {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    if (!partnerUserId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Rate limit per partner. The model bill is a real cost — a runaway
    // client or a curious partner slamming Enter can rack up API spend fast.
    // 30 messages / hour is generous for a real support conversation.
    if (!(await checkRateLimit(`chat-ai:${partnerUserId}`, 30, 60 * 60_000))) {
      return NextResponse.json(
        { error: 'Chat rate limit reached. Please wait a bit before sending more messages.' },
        { status: 429 },
      );
    }

    const apiKey = process.env.ZOE_API_KEY;
    if (!apiKey) {
      Sentry.captureMessage('chat_ai_missing_api_key', {
        level: 'fatal',
        tags: { route: 'chat/ai' },
      });
      return NextResponse.json(
        { error: 'AI assistant is temporarily unavailable. Please WhatsApp Zoe for now.' },
        { status: 503 },
      );
    }

    const model = createAnthropic({ apiKey })(MODEL_ID);

    // DefaultChatTransport from @ai-sdk/react sends UIMessages (parts[], no
    // content string). Convert to ModelMessages so streamText understands them.
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Cap message array size so a runaway client can't push 10k prior turns
    // through the model. Real convos rarely exceed a couple dozen turns.
    const cappedMessages = messages.slice(-30);

    const isUIFormat = cappedMessages[0]?.parts !== undefined;
    const modelMessages = isUIFormat
      ? await convertToModelMessages(cappedMessages)
      : cappedMessages;

    const result = streamText({
      model,
      // Fold the system prompt into a role:'system' message so we can attach
      // an Anthropic cacheControl breakpoint (drops input-token cost ~90%
      // on repeat turns). Matches how Clara on booking-web wires this —
      // proven pattern with AI SDK v6.
      messages: [
        {
          role: 'system' as const,
          content: SYSTEM_PROMPT,
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } },
        } as any,
        ...modelMessages,
      ],
      temperature: 0.3,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'chat/ai' } });
    return NextResponse.json(
      { error: 'AI assistant failed. Please try again or WhatsApp Zoe.' },
      { status: 500 },
    );
  }
}
