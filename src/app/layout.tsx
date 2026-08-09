import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { AppConfigProvider } from "@/components/app-config-provider";
import { AppFrame } from "@/components/layout/app-frame";
import { ONA_BUILD_ID } from "@/lib/build-id";
import { I18nProvider } from "@/lib/i18n";
import { AppProvider } from "@/lib/store";
import "./globals.css";

/**
 * Inter — closest free match to X’s Chirp (clean grotesque sans).
 * Used app-wide for menus, body, and chrome.
 */
const interSans = Inter({
  variable: "--font-ona-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Ona: Find mechanics, vulcanizers and tow near you",
  description:
    "Find and call mechanics, vulcanizers and tow trucks near you, within about 10 km.",
  applicationName: "Ona",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ona",
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
      data-ona-build={ONA_BUILD_ID}
      className={`${interSans.variable} ${geistMono.variable} h-full max-h-full overflow-hidden antialiased`}
      style={{ height: "100%", maxHeight: "100%" }}
    >
      {/* Inline stage color so first paint is never browser-default white */}
      <body
        className="h-full max-h-full overflow-hidden text-white"
        style={{
          overscrollBehavior: "none",
          backgroundColor: "#060d0a",
          margin: 0,
        }}
      >
        <AppConfigProvider>
          <AppProvider>
            <I18nProvider>
              <AppFrame>{children}</AppFrame>
            </I18nProvider>
          </AppProvider>
        </AppConfigProvider>
      </body>
    </html>
  );
}
