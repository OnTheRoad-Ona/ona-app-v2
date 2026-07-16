import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppConfigProvider } from "@/components/app-config-provider";
import { AppFrame } from "@/components/layout/app-frame";
import { AppProvider } from "@/lib/store";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  // Only latin weights used in UI — lighter first paint
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "OgaMecho: Find mechanics, vulcanizers and tow near you",
  description:
    "Find and call mechanics, vulcanizers and tow trucks near you, within about 10 km.",
  applicationName: "OgaMecho",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OgaMecho",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    // Help in-app browsers (WhatsApp, Instagram, etc.) render full height
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c8c9cd" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ backgroundColor: "#0a0a0a", height: "100%" }}
    >
      {/* Instant paint: never flash pure white while JS/CSS hydrate */}
      <body
        className="min-h-[100vh] min-h-[100dvh] min-h-[100svh] bg-[#0a0a0a] text-white"
        style={{
          backgroundColor: "#0a0a0a",
          overscrollBehavior: "none",
        }}
      >
        <AppConfigProvider>
          <AppProvider>
            <AppFrame>{children}</AppFrame>
          </AppProvider>
        </AppConfigProvider>
      </body>
    </html>
  );
}
