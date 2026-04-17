import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  // WHY: pdfkit reads its own .afm font files from disk at runtime
  // via fs.readFileSync. When Next bundles pdfkit into the server
  // build, those data files aren't copied and pdfkit throws ENOENT
  // on Helvetica.afm. Marking it server-external makes Next require()
  // it from node_modules at runtime so font resolution works.
  serverExternalPackages: ['pdfkit'],
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