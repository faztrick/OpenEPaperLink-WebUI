/** @type {import('next').NextConfig} */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirnameESM = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Monorepo-style layout (multiple package-lock.json files) caused Next to auto-infer an upstream root
  // and emit a warning. Explicitly set outputFileTracingRoot to the true workspace root to silence it.
  // Docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats
  outputFileTracingRoot: path.join(__dirnameESM, '..', '..', '..'),
};

export default nextConfig;
