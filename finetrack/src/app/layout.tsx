import type { Metadata } from "next";
import "./globals.css";
import { getI18n } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "FineTrack UAE — fines & tolls re-billing for fleets",
  description: "Match Salik, Darb, RTA and parking fines to the right driver or customer, and re-bill them.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getI18n();
  return (
    <html lang={locale} dir={dir}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
