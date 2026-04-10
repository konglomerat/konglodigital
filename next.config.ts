import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "40mb",
    scrollRestoration: true,
  },
};

export default nextConfig;
