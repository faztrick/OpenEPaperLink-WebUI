/** @type {import('next').NextConfig} */
import path from 'path';

const nextConfig = {
  reactStrictMode: true,
  // swcMinify removed in Next 15 (always on)
  images: {
    unoptimized: true // adjust if using Next Image later
  },
  // Silence workspace root inference warning by explicitly setting tracing root to project root
  outputFileTracingRoot: path.join(process.cwd(), '.')
};

export default nextConfig;
