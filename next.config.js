/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The static half of the security headers; the CSP needs a per-request
  // nonce and is set in proxy.ts. No Referrer-Policy stricter than the
  // default: Nominatim identifies the app by its Referer (CLAUDE.md).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
