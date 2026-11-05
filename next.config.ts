import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "pdfkit"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // photos
  // Fichiers lus au moment de générer les PDF : à embarquer dans le serveur (hébergement cloud)
  outputFileTracingIncludes: { "/**": ["./public/brand/logo-cmdpro-document.png", "./node_modules/pdfkit/js/data/**"] },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};
export default nextConfig;
