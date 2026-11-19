/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['googleapis', '@prisma/client', '@prisma/adapter-better-sqlite3', 'better-sqlite3'],
  // Teste local: libera o acesso pelo endereço de rede do computador (ex.: 192.168.0.8),
  // usado pelo celular. Sem isso o modo de desenvolvimento recarrega a página e perde o login.
  allowedDevOrigins: process.env.TESTE_LOCAL_HOST ? [process.env.TESTE_LOCAL_HOST] : [],
};
export default nextConfig;
