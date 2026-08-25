import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeDigest",
  description: "AI-powered video summarization and chat",
};

export default function RootLayout({
  children,
  auth,
}: Readonly<{
  children: React.ReactNode;
  auth: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        {auth}
      </body>
    </html>
  );
}
