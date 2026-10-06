import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Document uploads go through Server Actions; allow the 10 MB file limit plus form overhead.
    serverActions: { bodySizeLimit: "11mb" },
  },
  // Demo only: serves the local mock Entra provider from the app origin (see scripts/mock-oidc.ts).
  async rewrites() {
    const target = process.env.MOCK_OIDC_PROXY_TARGET;
    return target ? [{ source: "/auth/mock-oidc/:path*", destination: `${target}/:path*` }] : [];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
