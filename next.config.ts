import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Google Identity Services (Sign in with Google) + Apple ID SDK (Sign in with Apple)
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com https://accounts.google.com https://appleid.cdn-apple.com",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
      "img-src 'self' blob: data: https://agyzvknaqnamaoczxgsb.supabase.co https://*.stripe.com https://*.googleusercontent.com https://accounts.google.com",
      "font-src 'self'",
      "connect-src 'self' https://agyzvknaqnamaoczxgsb.supabase.co wss://agyzvknaqnamaoczxgsb.supabase.co https://api.stripe.com https://challenges.cloudflare.com https://accounts.google.com https://appleid.apple.com https://appleid.cdn-apple.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https://accounts.google.com https://appleid.apple.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://appleid.apple.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "agyzvknaqnamaoczxgsb.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "doctor-clean-singapore",
  project: "react-native",
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
