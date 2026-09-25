import type { Metadata } from "next";
import { Manrope, Spectral } from "next/font/google";
import ThemeScript from "@/components/ThemeScript";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const DESCRIPTION =
  "The student planner that catches assignments hidden in Canvas announcements and turns your finished work into a night sky.";

export const metadata: Metadata = {
  // Absolute URLs for link previews; update if the production domain changes.
  metadataBase: new URL("https://lodestarplanner.vercel.app"),
  title: {
    default: "Lodestar",
    template: "%s · Lodestar",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Lodestar",
    title: "Lodestar",
    description: DESCRIPTION,
    images: ["/brand/lodestar-logo-temp.png"],
  },
  twitter: {
    card: "summary",
    title: "Lodestar",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${manrope.variable} ${spectral.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
