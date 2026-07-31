import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const SITE_ORIGIN = "https://aimarketatlas.net";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const description =
    "Weekly AI market intelligence across public equities, compute, data-center energy, models, enterprise agents, and SiC.";

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      default: "AI Market Atlas",
      template: "%s · AI Market Atlas",
    },
    description,
    openGraph: {
      title: "AI Market Atlas",
      description,
      type: "website",
      images: [
        {
          url: `${SITE_ORIGIN}/og-equities.jpg`,
          width: 1774,
          height: 887,
          alt: "AI Market Atlas weekly AI market intelligence",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "AI Market Atlas",
      description,
      images: [`${SITE_ORIGIN}/og-equities.jpg`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
