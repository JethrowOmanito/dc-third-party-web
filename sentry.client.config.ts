import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://4d48e9ff6bab0b7aa5e11e8d74a66003@o4511244302352384.ingest.us.sentry.io/4511244310151168",
  tracesSampleRate: 0.1, // dropped from 1.0 to save Sentry quota (10% still catches issues)
  debug: false,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  // Filter browser-extension noise (learned from booking-web Sentry incident 2026-08-30)
  // addEL_hook = Kaspersky/similar monkey-patching addEventListener
  // <anonymous> top frames = injected extension scripts
  ignoreErrors: [
    "addEL_hook",
    "Cannot read properties of null (reading 'tagName')",
    "fb_xd_fragment",
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    "top.GLOBALS",
    "originalCreateNotification",
    "canvas.contentDocument",
    "MyApp_RemoveAllHighlights",
    "Blocked a frame with origin",
    "conduitPage",
    "Illegal invocation",
  ],

  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-extension:\/\//i,
    /^safari-web-extension:\/\//i,
    /^webkit-masked-url:\/\//i,
    /pagead\/js/i,
    /googlesyndication/i,
    /doubleclick\.net/i,
  ],

  // Drop events with an anonymous top frame ONLY when the stack shows no
  // trace of our own bundle. Browser-extension-injected scripts typically
  // have a very short stack with no reference to /_next/ chunks; real
  // vendor errors (Stripe.js, jose) still keep our app frames underneath.
  beforeSend(event) {
    const frames = event.exception?.values?.[0]?.stacktrace?.frames;
    if (!frames || frames.length === 0) return event;
    const top = frames[frames.length - 1];
    const topIsAnon = !top.filename || top.filename === "<anonymous>";
    if (!topIsAnon) return event;
    const hasAppFrame = frames.some((f) => {
      const fn = f.filename ?? "";
      return fn.includes("/_next/") || fn.includes("securedoctorclean");
    });
    if (hasAppFrame) return event;
    return null;
  },
});
