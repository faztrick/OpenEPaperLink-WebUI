/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // Use default .next directory; prior custom distDir caused locked trace file issues on Windows
  images: {
    unoptimized: true
  }
  // Removed unsupported experimental.outputFileTracing flag (produced warning in Next 15.5)
};

export default nextConfig;
