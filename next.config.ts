import { execSync } from 'child_process';
import type { NextConfig } from "next";

const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  output: 'standalone',
  bundlePagesRouterDependencies: true,
  outputFileTracingExcludes: {
    '*': [
      './release/**',
      './CLAUDE.md',
      './AGENTS.md',
      './README*.md',
      './docs/**',
      './.specs/**',
      './.claude/**',
      './tests/**',
    ],
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['react-icons'],
  },
  i18n: {
    locales: ['en', 'ko', 'ja', 'zh-CN', 'es', 'de', 'fr', 'pt-BR', 'zh-TW', 'ru', 'tr'],
    defaultLocale: 'en',
    localeDetection: false,
  },
  headers: async () => [
    {
      source: '/fonts/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ],
};

export default nextConfig;
