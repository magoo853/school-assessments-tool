import type { Metadata, Viewport } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "School Assessments Tool",
  description: "Standalone school safety assessment app for assessors",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon",
  },
  appleWebApp: {
    capable: true,
    title: "Assessments",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1120",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
