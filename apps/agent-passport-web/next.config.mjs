/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@aoc-enterprise/agent-governance'],
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  webpack: (config) => {
    // Allow .js imports to resolve to .ts files (TypeScript ESM convention)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
