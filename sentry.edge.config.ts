import * as Sentry from "@sentry/nextjs";

const SENSITIVE_BODY_FIELDS = new Set([
  "password",
  "password_hash",
  "signup_token",
  "code",
  "otp",
  "Email",
  "email",
  "Whatsapp_Number",
  "whatsapp_phone",
  "phone",
  "Name",
  "name",
  "full_name",
  "Title",
  "Contact_Number",
  "client_secret",
]);

function redact<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_BODY_FIELDS.has(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

Sentry.init({
  dsn: "https://4d48e9ff6bab0b7aa5e11e8d74a66003@o4511244302352384.ingest.us.sentry.io/4511244310151168",
  tracesSampleRate: 0.1,
  debug: false,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      if (event.request.cookies) event.request.cookies = { redacted: "[REDACTED]" };
      if (event.request.headers) {
        const h = event.request.headers as Record<string, string>;
        for (const key of Object.keys(h)) {
          const low = key.toLowerCase();
          if (
            low === "cookie" ||
            low === "authorization" ||
            low === "stripe-signature" ||
            low === "x-cron-secret"
          ) {
            h[key] = "[REDACTED]";
          }
        }
      }
      if (event.request.data) {
        event.request.data = redact(event.request.data);
      }
    }
    if (event.extra) event.extra = redact(event.extra);
    if (event.contexts) event.contexts = redact(event.contexts);
    return event;
  },
});
