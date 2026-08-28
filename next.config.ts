import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "75mb",
    scrollRestoration: true,
  },
  // "Projekte" heißt jetzt "Hier entstanden". Alte Links – auch aus bereits
  // versendeten Newslettern – zeigen weiter auf /projects.
  async redirects() {
    return [
      {
        source: "/projects/:path*",
        destination: "/showcase/:path*",
        permanent: true,
      },
      {
        source: "/:lang(de|en)/projects/:path*",
        destination: "/:lang/showcase/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
