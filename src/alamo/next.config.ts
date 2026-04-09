import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  // WHY: Default server action body limit is 1MB. UPS detail
  // invoices with 4000+ rows exceed this. 10MB covers all
  // realistic carrier invoice file sizes.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;