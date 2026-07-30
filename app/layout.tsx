import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "Weekly AI market intelligence across public equities, compute, data-center energy, models, enterprise agents, and SiC.";

  return {
    metadataBase: new URL(origin),
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
          url: `${origin}/og-equities.jpg`,
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
      images: [`${origin}/og-equities.jpg`],
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
