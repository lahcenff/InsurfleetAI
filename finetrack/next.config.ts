import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "exceljs", "pdf-lib", "nodemailer"],
  experimental: {
    // CSV / Excel imports and dispute attachments are sent through server actions.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
