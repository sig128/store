import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const isProdEnv = process.env.APP_ENV === "production";

// Media can be served from S3-compatible object storage (CDN). Allow that host for next/image.
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [];
if (process.env.S3_PUBLIC_BASE_URL) {
  try {
    const u = new URL(process.env.S3_PUBLIC_BASE_URL);
    remotePatterns.push({ protocol: u.protocol.replace(":", "") as "https" | "http", hostname: u.hostname, pathname: `${u.pathname.replace(/\/$/, "")}/**` });
  } catch {
    /* invalid URL — env validation reports it at runtime */
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://checkout.stripe.com https://www.paypal.com https://www.sandbox.paypal.com",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  ...(isProdEnv ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const DEMO_FILES = ["./.demo-db/seeded.tar.gz", "./.demo-db/secrets.json", "./node_modules/@electric-sql/pglite/dist/*.wasm", "./node_modules/@electric-sql/pglite/dist/*.data"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "pg", "nodemailer", "@resvg/resvg-js", "@electric-sql/pglite"],
  // Serverless hosts (Vercel): the local media store is copied in at build time
  // (npm run media:sync); ship it with the routes that read it.
  outputFileTracingIncludes: {
    // Demo mode (no DATABASE_URL): the seeded embedded-Postgres snapshot and its runtime.
    "/*": DEMO_FILES,
    "/**": DEMO_FILES,
    "/media/**": ["./storage/products/**/*", "./storage/outfits/**/*"],
    "/admin/**": ["./storage/print-files/**/*"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [60, 75, 85],
    deviceSizes: [420, 640, 828, 1080, 1280, 1600, 2048],
    imageSizes: [64, 96, 128, 256, 384],
    remotePatterns,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Guest order pages carry secrets in the URL only briefly; never leak them via Referer.
      { source: "/o/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/orders/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
