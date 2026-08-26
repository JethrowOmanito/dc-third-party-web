import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://4d48e9ff6bab0b7aa5e11e8d74a66003@o4511244302352384.ingest.us.sentry.io/4511244310151168",
  tracesSampleRate: 1.0,
  debug: false,
});
