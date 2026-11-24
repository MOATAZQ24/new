/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AuthProvider } from "@/context/AuthContext";
import { CustomizationProvider } from "@/context/CustomizationContext";
import { ToastProvider } from "@/context/ToastContext";
import DevToolkitLoader from "@/components/dev/DevToolkitLoader";
import { buildPreHydrationThemeScript } from "@/lib/applyTheme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "بوابة المستثمر — Investor Gate OS",
  description: "نظام إدارة عمليات تقنية المعلومات والأصول ومكتب المساعدة للشركات المتعددة",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icon-192-maskable.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "بوابة المستثمر",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#111413" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className="h-full" suppressHydrationWarning>
      <head>
        <script
          id="theme-pre-hydration"
          dangerouslySetInnerHTML={{ __html: buildPreHydrationThemeScript() }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)] font-sans antialiased">
        <AuthProvider>
          <WorkspaceProvider>
            <CustomizationProvider>
              <ToastProvider>{children}</ToastProvider>
              {process.env.NEXT_PUBLIC_DEV_TOOLKIT === "1" ? <DevToolkitLoader /> : null}
            </CustomizationProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
