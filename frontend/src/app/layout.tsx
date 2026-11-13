import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AuthProvider } from "@/context/AuthContext";
import { CustomizationProvider } from "@/context/CustomizationContext";

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
    <html lang="ar" dir="rtl" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-full flex flex-col bg-[#F5F7F8] dark:bg-slate-900 text-[#1e293b] dark:text-slate-100 font-sans antialiased">
        <AuthProvider>
          <WorkspaceProvider>
            <CustomizationProvider>{children}</CustomizationProvider>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
