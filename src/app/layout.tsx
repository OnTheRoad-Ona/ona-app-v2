import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProvider } from "@/lib/store";
import { AuthGate } from "@/components/auth/auth-gate";
import { PhoneShell } from "@/components/layout/phone-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OgaMecho — Find Mechanics, Vulcanizers & Towing Nearby",
  description:
    "Live mechanic discovery and dispatch. Instantly connect with nearby mechanics, vulcanizers, and tow trucks within 0–10 km.",
  applicationName: "OgaMecho",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#e85a12",
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
    >
      <body className="min-h-full">
        <AppProvider>
          <PhoneShell>
            <AuthGate>{children}</AuthGate>
          </PhoneShell>
        </AppProvider>
      </body>
    </html>
  );
}
