/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Baseline hardening for a tool whose share files and reports
          // carry school-security content. The CSP below is the safe
          // subset only (object/base/form/frame directives): the app
          // relies on inline styles/data-URL images throughout, so a
          // strict script/style CSP would need its own dedicated pass.
          {
            key: "Content-Security-Policy",
            value:
              "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
