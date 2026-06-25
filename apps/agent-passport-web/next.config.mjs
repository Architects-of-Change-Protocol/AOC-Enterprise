/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aoc-enterprise/agent-governance'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

export default nextConfig;
