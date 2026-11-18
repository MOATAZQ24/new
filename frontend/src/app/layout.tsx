import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AuthProvider } from "@/context/AuthContext";
import { CustomizationProvider } from "@/context/CustomizationContext";
import { ToastProvider } from "@/context/ToastContext";
import { buildPreHydrationThemeScript } from "@/lib/applyTheme";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Investor Gate - نظام إدارة عمليات تقنية المعلومات",
  description: "نظام إدارة الأصول التقنية ومكتب المساعدة والعمليات للشركات المتعددة",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className="h-full" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: buildPreHydrationThemeScript() }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)] font-sans antialiased">
        <AuthProvider>
          <WorkspaceProvider>
            <CustomizationProvider>
              <ToastProvider>{children}</ToastProvider>
            </CustomizationProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
