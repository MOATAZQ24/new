/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import type { NextConfig } from "next";
import os from "os";

const backendOrigin = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";

// Dynamically discover all local network interface IPv4 addresses for seamless real mobile LAN testing
const nets = os.networkInterfaces();
const localIps = Object.values(nets)
  .flat()
  .filter((net): net is os.NetworkInterfaceInfo => !!net && net.family === "IPv4")
  .map((net) => net.address);

const allowedDevOrigins = Array.from(
  new Set([
    "127.0.0.1",
    "localhost",
    ...localIps,
    "192.168.8.194",
    "192.168.8.137",
    "*.local",
  ])
);

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  allowedDevOrigins,
  output: "standalone",
  devIndicators: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
    ];
  },
  async redirects() {
    return [
      { source: "/forgot-password", destination: "/login", permanent: false },
      { source: "/reset-password", destination: "/login", permanent: false },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
