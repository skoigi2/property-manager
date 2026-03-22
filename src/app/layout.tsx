import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, DM_Mono, DM_Sans } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { Providers } from "@/components/Providers";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Property Manager — Alba Gardens & Riara One",
  description: "Property management for Alba Gardens and Riara One, Nairobi",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PropMgr",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1A2E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${dmMono.variable} ${dmSans.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Toaster
          position="top-right"
          toastOptions={{
            className: "font-sans text-sm",
            success: { iconTheme: { primary: "#16A34A", secondary: "#fff" } },
            error: { iconTheme: { primary: "#DC2626", secondary: "#fff" } },
          }}
        />
      </body>
    </html>
  );
}
