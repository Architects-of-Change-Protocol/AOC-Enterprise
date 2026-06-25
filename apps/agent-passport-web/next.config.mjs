/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aoc-enterprise/agent-governance'],
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
