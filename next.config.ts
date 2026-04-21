import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/adapter-neon', '@neondatabase/serverless'],
};

export default nextConfig;
