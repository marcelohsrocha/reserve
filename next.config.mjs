/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['googleapis', '@prisma/client', '@prisma/adapter-better-sqlite3', 'better-sqlite3'],
};
export default nextConfig;
