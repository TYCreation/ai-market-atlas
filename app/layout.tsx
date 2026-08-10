import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteStructuredData } from "./components/StructuredData";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_ORIGIN } from "./seo";
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
  const description =
    "Weekly AI market intelligence across public equities, compute, data-center energy, models, enterprise agents, and SiC.";

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: {
      default: SITE_NAME,
      template: `%s · ${SITE_NAME}`,
    },
    description,
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: ["/favicon.svg"],
    },
    openGraph: {
      title: SITE_NAME,
      description,
      type: "website",
      images: [
        {
          url: DEFAULT_OG_IMAGE,
          width: 1774,
          height: 887,
          alt: "AI Market Atlas weekly AI market intelligence",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description,
      images: [DEFAULT_OG_IMAGE],
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
        <SiteStructuredData />
        {children}
      </body>
    </html>
  );
}
