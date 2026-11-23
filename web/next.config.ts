import type { NextConfig } from "next";

// The browser only talks to Next.js; API and auth calls are proxied to Django so session
// cookies stay same-origin and no CORS setup is needed.
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Load only the parts of the animation library each page uses, not the whole package.
  experimental: { optimizePackageImports: ["motion"] },
  // The browser pings the API directly only to wake it when it's asleep (see lib/wake.ts).
  env: { NEXT_PUBLIC_BACKEND_URL: backend },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/_allauth/:path*", destination: `${backend}/_allauth/:path*` },
    ];
  },
};

export default nextConfig;
