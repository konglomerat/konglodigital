import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "75mb",
    scrollRestoration: true,
  },
};

export default nextConfig;
