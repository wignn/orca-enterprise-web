import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  outputFileTracingRoot: rootDir,
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
