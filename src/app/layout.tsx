import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { brand } from "@/config/brand";
import "./globals.css";

const display = localFont({
  src: "./fonts/big-shoulders-wght.woff2",
  variable: "--ff-display",
  weight: "100 900",
  display: "swap",
});
const sans = localFont({
  src: "./fonts/archivo-wght.woff2",
  variable: "--ff-sans",
  weight: "100 900",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--ff-mono",
  display: "swap",
});
const stencil = localFont({
  src: "./fonts/big-shoulders-stencil-800.woff2",
  variable: "--ff-stencil",
  weight: "800",
  display: "swap",
  preload: false,
});

const base = process.env.APP_URL ?? `https://${brand.domain}`;

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: { default: `${brand.name} — ${brand.dropName}`, template: `%s · ${brand.name}` },
  description: brand.tagline,
  applicationName: brand.name,
  openGraph: {
    type: "website",
    siteName: brand.name,
    title: `${brand.name} — ${brand.dropName}`,
    description: brand.tagline,
    images: [{ url: "/og/default.jpg", width: 1200, height: 630, alt: `${brand.name} — ${brand.dropName}` }],
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: brand.colors.night,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} ${stencil.variable}`}>
      <body>{children}</body>
    </html>
  );
}
