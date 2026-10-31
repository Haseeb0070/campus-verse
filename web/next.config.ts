import type { NextConfig } from "next";

// The browser only talks to Next.js; API and auth calls are proxied to Django so session
// cookies stay same-origin and no CORS setup is needed.
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/_allauth/:path*", destination: `${backend}/_allauth/:path*` },
    ];
  },
};

export default nextConfig;
