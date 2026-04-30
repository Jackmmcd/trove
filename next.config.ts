import type { NextConfig } from "next";
import path from "path";

const isVercel = process.env.VERCEL === '1';

const nextConfig: NextConfig = {
  // Static export for Vercel — landing page only, no API routes needed
  ...(isVercel ? { output: 'export' } : {}),
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
