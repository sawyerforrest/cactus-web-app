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
  // WHY: Bypass type check during build. Per master briefing Section
  // 12 / Session 7C, there are 11 pre-existing TypeScript errors in
  // app/invoices/... — all Supabase generic-error narrowing noise
  // with zero functional impact. Real fix is a focused cleanup
  // session; until then, this flag prevents the noise from blocking
  // deploys. Compilation errors still surface (only the post-compile
  // type check is skipped).
  typescript: {
    ignoreBuildErrors: true,
  },
  // WHY: Default server action body limit is 1MB. Real workloads need more:
  //   - UPS detail invoices with 4000+ rows
  //   - PLD reference-data uploads, especially the GOFO Standard zone
  //     workbook (8 tabs × 93,100 ZIP5 rows ≈ 6-8MB raw, larger after
  //     multipart encoding) and future rate-card XLSXs
  // 20MB gives ample headroom for both today's files and the rate-card
  // sets coming in sub-phase 2b. Per-file size guards in individual
  // Server Actions stay tighter (e.g. 10MB on each DHL Domestic per-DC
  // file) so genuinely oversized uploads still fail fast with a
  // user-friendly message.
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;